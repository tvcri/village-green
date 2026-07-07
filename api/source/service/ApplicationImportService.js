'use strict'

const Anthropic = require('@anthropic-ai/sdk')
const { PDFDocument } = require('pdf-lib')
const config = require('../utils/config')

// --- structured-outputs schema helpers -------------------------------------
// The API's structured-outputs validator caps union-typed parameters (type
// arrays or anyOf) at 16 per schema, so the extraction schema avoids
// nullability entirely: blank fields are empty strings ("") and dues amounts
// are digit strings. normalizeBlanks() restores the null-based wire contract
// after parsing, so nothing downstream changes.
const str = { type: 'string' }
const num = { type: 'string', description: 'Numeric amount as digits, or "" if blank' }
const yn = { type: 'string', enum: ['Yes', 'No', ''] }
const ynSometimes = { type: 'string', enum: ['Yes', 'No', 'Sometimes', ''] }

const memberEntry = {
  type: 'object',
  additionalProperties: false,
  required: ['firstName', 'middleInitial', 'lastName', 'nickname', 'pronouns', 'birthDate',
    'gender', 'veteran', 'street', 'unit', 'city', 'state', 'zip', 'email', 'phone', 'cell',
    'accessibility', 'accessibilityNotes'],
  properties: {
    firstName: str, middleInitial: str, lastName: str, nickname: str, pronouns: str,
    birthDate: { ...str, description: 'YYYY-MM-DD' }, gender: str, veteran: yn,
    street: str, unit: str, city: str, state: str, zip: str,
    email: str, phone: { ...str, description: 'home phone' }, cell: str,
    accessibility: {
      type: 'object',
      additionalProperties: false,
      required: ['difficultyHearing', 'visionLimited', 'usesWalker', 'usesCane', 'usesWheelchair'],
      properties: {
        difficultyHearing: ynSometimes, visionLimited: ynSometimes,
        usesWalker: ynSometimes, usesCane: ynSometimes, usesWheelchair: ynSometimes,
      },
    },
    accessibilityNotes: { ...str, description: 'Any handwritten explain/detail text for the accessibility questions, verbatim' },
  },
}

const volunteerPerson = {
  type: 'object',
  additionalProperties: false,
  required: ['firstName', 'middleInitial', 'lastName', 'nickname', 'pronouns', 'birthDate',
    'gender', 'veteran', 'language', 'street', 'unit', 'city', 'state', 'zip', 'email', 'phone', 'cell'],
  properties: {
    firstName: str, middleInitial: str, lastName: str, nickname: str, pronouns: str,
    birthDate: { ...str, description: 'YYYY-MM-DD' }, gender: str, veteran: yn,
    language: { ...str, description: 'Language(s) spoken other than English' },
    street: str, unit: str, city: str, state: str, zip: str,
    email: str, phone: { ...str, description: 'home phone' }, cell: str,
  },
}

const CAPABILITY_NAME_ENUM = ['Rides', 'Errands', 'Home Help', 'Steering Committee', 'Tech Support', 'Friends']

const EXTRACTION_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['applicationType', 'application', 'members', 'emergencyContact', 'preferences', 'uncertainFields'],
      properties: {
        applicationType: { const: 'member' },
        application: {
          type: 'object',
          additionalProperties: false,
          required: ['applicationDate', 'villageName', 'ambassador', 'householdType'],
          properties: {
            applicationDate: { ...str, description: 'YYYY-MM-DD' },
            villageName: str,
            ambassador: str,
            householdType: { type: 'string', enum: ['Single', 'Dual', ''] },
          },
        },
        members: { type: 'array', items: memberEntry },
        emergencyContact: {
          type: 'object',
          additionalProperties: false,
          required: ['firstName', 'middleInitial', 'lastName', 'phoneHome', 'phoneCell', 'email', 'relationship'],
          properties: {
            firstName: str, middleInitial: str, lastName: str,
            phoneHome: str, phoneCell: str, email: str, relationship: str,
          },
        },
        preferences: {
          type: 'object',
          additionalProperties: false,
          required: ['newsletterPrint', 'wantsVolunteerInfo', 'circleOfPrideJoin', 'circleOfPridePreferred',
            'duesMonthly', 'duesYearly', 'paymentMethod', 'invoiceMailed'],
          properties: {
            newsletterPrint: yn, wantsVolunteerInfo: yn,
            circleOfPrideJoin: yn, circleOfPridePreferred: yn,
            duesMonthly: num, duesYearly: num,
            paymentMethod: { type: 'string', enum: ['Online', 'Bank Payment', 'Bank Withdrawal', 'Personal Check', ''] },
            invoiceMailed: yn,
          },
        },
        uncertainFields: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'reason', 'alternative'],
            properties: { path: { type: 'string' }, reason: { type: 'string' }, alternative: { type: 'string', description: '"" when no alternative reading' } },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['applicationType', 'application', 'person', 'emergencyContact', 'capabilityNames',
        'circleOfPrideJoin', 'notes', 'uncertainFields'],
      properties: {
        applicationType: { const: 'volunteer' },
        application: {
          type: 'object',
          additionalProperties: false,
          required: ['applicationDate', 'villageName', 'ambassador'],
          properties: {
            applicationDate: { ...str, description: 'YYYY-MM-DD' },
            villageName: str,
            ambassador: str,
          },
        },
        person: volunteerPerson,
        emergencyContact: {
          type: 'object',
          additionalProperties: false,
          required: ['firstName', 'middleInitial', 'lastName', 'phoneHome', 'phoneCell', 'email', 'relationship'],
          properties: {
            firstName: str, middleInitial: str, lastName: str,
            phoneHome: str, phoneCell: str, email: str, relationship: str,
          },
        },
        capabilityNames: { type: 'array', items: { type: 'string', enum: CAPABILITY_NAME_ENUM } },
        circleOfPrideJoin: yn,
        notes: { ...str, description: 'Substantive free-text only — see prompt' },
        uncertainFields: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'reason', 'alternative'],
            properties: { path: { type: 'string' }, reason: { type: 'string' }, alternative: { type: 'string', description: '"" when no alternative reading' } },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['applicationType', 'reason'],
      properties: { applicationType: { const: 'unknown' }, reason: { type: 'string' } },
    },
  ],
}

// The combined member+volunteer schema above is too large for a single
// structured-outputs call once both variants are fully fleshed out (Anthropic
// rejects the request with "compiled grammar is too large"). Extraction is
// therefore two-phase: a tiny CLASSIFY_SCHEMA call against page 1 only picks
// the document type, then a second call sends the full document against only
// that one matching variant (plus the "unknown" fallback, in case phase 2
// itself can't extract cleanly). variantSchemaFor looks up each variant by
// its applicationType const so there is one source of truth for each shape.
const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationType', 'reason'],
  properties: {
    applicationType: { type: 'string', enum: ['member', 'volunteer', 'unknown'] },
    reason: { type: 'string', description: '"" unless applicationType is "unknown"' },
  },
}

const CLASSIFY_PROMPT = `You are looking at page 1 of a scanned application form for the Village Common of Rhode Island. Identify the document type from this page alone:
- A MEMBERSHIP application: applicationType "member".
- A VOLUNTEER application: applicationType "volunteer".
- Anything else (blank form, wrong document, unreadable scan): applicationType "unknown", with a short "reason".
Return "reason" as "" unless applicationType is "unknown".`

const unknownVariant = EXTRACTION_SCHEMA.anyOf.find(v => v.properties.applicationType.const === 'unknown')

function variantSchemaFor (applicationType) {
  const matched = EXTRACTION_SCHEMA.anyOf.find(v => v.properties.applicationType.const === applicationType)
  if (!matched) return unknownVariant
  return { anyOf: [matched, unknownVariant] }
}

async function extractPage1 (pdfBuffer) {
  const srcDoc = await PDFDocument.load(pdfBuffer)
  const outDoc = await PDFDocument.create()
  const [page] = await outDoc.copyPages(srcDoc, [0])
  outDoc.addPage(page)
  return Buffer.from(await outDoc.save())
}

const EXTRACTION_PROMPT = `You are processing a scanned application form for the Village Common of Rhode Island.

First, identify the document type:
- A MEMBERSHIP application: return the "member" variant of the schema with all extracted fields.
- A VOLUNTEER application: return the "volunteer" variant of the schema with all extracted fields.
- Anything else (blank form, wrong document, unreadable scan): return {"applicationType": "unknown", "reason": "<short explanation>"}.

For a membership application:
- The form may be filled in block-print style where all letters appear uppercase. Use letter size to infer true case: larger letters represent intended uppercase (start of a word or proper noun) and smaller letters represent intended lowercase. Apply standard title case to names, streets, and cities accordingly. Never return all-caps values for text fields.
- "members" holds one entry for a Single household. For a Dual household, extract the second household member's own fields as a second entry (never more than two entries). If the second person's field is blank on the form, use an empty string — do not copy the first person's value.
- For any field that is blank or not filled in, use an empty string "".
- duesMonthly and duesYearly are digit strings (e.g. "120"), or "" if blank.
- Accessibility questions (difficultyHearing, visionLimited, usesWalker, usesCane, usesWheelchair) are Yes/No/Sometimes checkboxes with an adjacent "explain" line. Some applicants check "Yes" but write their explanation on the "Sometimes" line, or check both. When this happens, use the checked Yes/No value as the field's answer — do NOT report it as an uncertain field, this is not ambiguous, the applicant's intent is clear from the checkbox. Instead, put the full explain text verbatim in accessibilityNotes (e.g. "Vision limited: needs glasses. Uses walker: rollator for travel."), one line per field that has explain text. accessibilityNotes is "" if no field had any handwritten explanation.
- If "No Emergency Contact" is checked or no emergency contact is given, return emergencyContact with every field set to "".
- Dates are YYYY-MM-DD.
- "uncertainFields": list ONLY fields whose values are genuinely ambiguous from the handwriting or scan quality — a digit that could be read two ways, a partially cut-off word, an ambiguous checkbox. For each, give the JSON path (e.g. "members[0].zip"), a short reason, and your best alternative reading ("" if none). Do not list fields you read confidently; an empty array means everything was clear.
- For a volunteer application:
  - The same block-print case-inference and blank-field rules above apply.
  - "capabilityNames" lists every checked volunteer-opportunity option, using these exact names: "Rides", "Errands", "Home Help" (for "Light Household Maintenance"), "Steering Committee" (for "Steering Committee Member"), "Tech Support" (for "Technology Support"), "Friends" (for "Village Friends"). The form shows "Driver" as a parent checkbox with "Rides" and "Errands" as its own indented sub-checkboxes — read the Rides and Errands checkboxes directly; include each only if its own box is checked, regardless of whether the parent "Driver" box is checked or blank.
  - "circleOfPrideJoin" is the form's "Would you like to support the Circle of Pride as a volunteer?" Yes/No answer.
  - Do NOT extract anything from the "Supplemental Section for Drivers" page (license restrictions, vehicle table, insurance company, signature, document checklist) — skip that entire page.
  - Do NOT extract the checkbox/dropdown answers from the "Supplemental Section for Village Friends Volunteers" page (service type, employment status, occupation, activity preferences). However, if that page's free-text boxes ("What activities..." or "Please supply any other relevant information") contain substantive, non-routine content — a real note about the volunteer's situation, needs, or support arrangements — extract that text verbatim into "notes". If those boxes are blank or contain only routine/no content, "notes" is "".
  - Confidentiality/Liability waiver text, its signature, and its date are never extracted.`

// --- assembly ---------------------------------------------------------------

// The schema is null-free (see helpers above); restore the null-based wire
// contract: "" → null recursively, dues digit strings → numbers, and all-empty
// accessibility/emergencyContact objects → null.
function normalizeBlanks (value) {
  if (value === '') return null
  if (Array.isArray(value)) return value.map(normalizeBlanks)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeBlanks(v)]))
  }
  return value
}

function toAmount (v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function nullIfAllNull (obj) {
  if (!obj) return null
  return Object.values(obj).every(v => v === null) ? null : obj
}

// Applicants write informal village names ("Warwick Village" for "Warwick");
// compare with the word "village" and punctuation stripped, then fall back to
// a substring match only when it is unambiguous.
function normalizeVillageName (name) {
  return name
    .toLowerCase()
    .replace(/\bvillage\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveVillage (villageName, villages) {
  if (!villageName) return { villageId: null, villageName: null }
  const needle = normalizeVillageName(villageName)
  let match = needle ? villages.find(v => normalizeVillageName(v.name) === needle) : null
  if (!match && needle) {
    const candidates = villages.filter(v => {
      const n = normalizeVillageName(v.name)
      return n && (n.includes(needle) || needle.includes(n))
    })
    if (candidates.length === 1) match = candidates[0]
  }
  return { villageId: match?.villageId ?? null, villageName: match?.name ?? villageName.trim() }
}

function assembleResponse (data, villages, usage) {
  data = normalizeBlanks(data)
  if (data.applicationType === 'volunteer') {
    return {
      applicationType: 'volunteer',
      application: {
        applicationDate: data.application.applicationDate,
        village: resolveVillage(data.application.villageName, villages),
        ambassador: data.application.ambassador,
      },
      person: data.person,
      emergencyContact: data.emergencyContact,
      capabilityNames: data.capabilityNames,
      circleOfPrideJoin: data.circleOfPrideJoin,
      notes: data.notes,
      uncertainFields: data.uncertainFields,
      usage,
    }
  }
  if (data.applicationType !== 'member') {
    return { ...data, usage }
  }
  const members = data.members.slice(0, 2).map(m => {
    const { pronouns, gender, veteran, accessibility, accessibilityNotes, ...person } = m
    return { ...person, extras: { pronouns, gender, veteran, accessibility: nullIfAllNull(accessibility), accessibilityNotes } }
  })
  const { newsletterPrint, duesMonthly, duesYearly, paymentMethod, invoiceMailed, ...preferences } = data.preferences
  return {
    applicationType: 'member',
    application: {
      applicationDate: data.application.applicationDate,
      village: resolveVillage(data.application.villageName, villages),
      ambassador: data.application.ambassador,
      householdType: data.application.householdType,
    },
    members,
    emergencyContact: nullIfAllNull(data.emergencyContact),
    preferences,
    memberDefaults: {
      printedNewsletter: newsletterPrint === 'Yes',
      duesMonthly: toAmount(duesMonthly),
      duesYearly: toAmount(duesYearly),
      paymentMethod, invoiceMailed,
    },
    uncertainFields: data.uncertainFields,
    usage,
  }
}

// claude-opus-4-8: $5/MTok input, $25/MTok output
function computeCost ({ input_tokens, output_tokens }) {
  return {
    inputTokens: input_tokens,
    outputTokens: output_tokens,
    cost: (input_tokens / 1_000_000 * 5) + (output_tokens / 1_000_000 * 25),
  }
}

async function callClaude (client, pdfBuffer, schema, prompt) {
  let message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })
  }
  catch (sdkErr) {
    const err = new Error(`Anthropic API error: ${sdkErr.message}`)
    err.status = 502
    throw err
  }
  if (message.stop_reason === 'refusal') {
    const err = new Error('The extraction request was declined by the model. Verify the document is an application form.')
    err.status = 400
    throw err
  }
  const text = message.content?.find(b => b.type === 'text')?.text
  if (!text) {
    const err = new Error('Claude returned an empty response.')
    err.status = 502
    throw err
  }
  // Structured outputs guarantee this parses and validates against the schema passed in
  return { data: JSON.parse(text), usage: message.usage }
}

function combineCost (usages) {
  const totals = usages.reduce((acc, u) => ({
    input_tokens: acc.input_tokens + u.input_tokens,
    output_tokens: acc.output_tokens + u.output_tokens,
  }), { input_tokens: 0, output_tokens: 0 })
  return computeCost(totals)
}

async function extractFromPdf (pdfBuffer) {
  if (!config.anthropic.apiKey) {
    const err = new Error('PDF extraction is not configured: VG_ANTHROPIC_API_KEY is not set.')
    err.status = 500
    throw err
  }
  const client = new Anthropic({ apiKey: config.anthropic.apiKey })

  const page1 = await extractPage1(pdfBuffer)
  const classified = await callClaude(client, page1, CLASSIFY_SCHEMA, CLASSIFY_PROMPT)
  if (classified.data.applicationType === 'unknown') {
    return {
      data: { applicationType: 'unknown', reason: classified.data.reason },
      usage: combineCost([classified.usage]),
    }
  }

  const extracted = await callClaude(client, pdfBuffer, variantSchemaFor(classified.data.applicationType), EXTRACTION_PROMPT)
  return { data: extracted.data, usage: combineCost([classified.usage, extracted.usage]) }
}

module.exports = {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  CLASSIFY_SCHEMA,
  CLASSIFY_PROMPT,
  variantSchemaFor,
  extractPage1,
  resolveVillage,
  assembleResponse,
  computeCost,
  extractFromPdf,
}
