'use strict'

const Anthropic = require('@anthropic-ai/sdk')
const config = require('../utils/config')

// --- structured-outputs schema helpers -------------------------------------
const str = { type: ['string', 'null'] }
const num = { type: ['number', 'null'] }
// The API's structured-outputs validator rejects enum combined with a type
// array — nullable enums must be an anyOf of a string-enum branch and null.
const nullableEnum = values => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] })
const yn = nullableEnum(['Yes', 'No'])
const ynSometimes = nullableEnum(['Yes', 'No', 'Sometimes'])

const memberEntry = {
  type: 'object',
  additionalProperties: false,
  required: ['firstName', 'middleInitial', 'lastName', 'nickname', 'pronouns', 'birthDate',
    'gender', 'veteran', 'street', 'unit', 'city', 'state', 'zip', 'email', 'phone', 'cell',
    'accessibility'],
  properties: {
    firstName: str, middleInitial: str, lastName: str, nickname: str, pronouns: str,
    birthDate: { ...str, description: 'YYYY-MM-DD' }, gender: str, veteran: yn,
    street: str, unit: str, city: str, state: str, zip: str,
    email: str, phone: { ...str, description: 'home phone' }, cell: str,
    accessibility: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['difficultyHearing', 'visionLimited', 'usesWalker', 'usesCane', 'usesWheelchair'],
      properties: {
        difficultyHearing: ynSometimes, visionLimited: ynSometimes,
        usesWalker: ynSometimes, usesCane: ynSometimes, usesWheelchair: ynSometimes,
      },
    },
  },
}

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
            householdType: nullableEnum(['Single', 'Dual']),
          },
        },
        members: { type: 'array', items: memberEntry },
        emergencyContact: {
          type: ['object', 'null'],
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
            paymentMethod: nullableEnum(['Online', 'Bank Payment', 'Bank Withdrawal', 'Personal Check']),
            invoiceMailed: yn,
          },
        },
        uncertainFields: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'reason', 'alternative'],
            properties: { path: { type: 'string' }, reason: { type: 'string' }, alternative: str },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['applicationType'],
      properties: { applicationType: { const: 'volunteer' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['applicationType', 'reason'],
      properties: { applicationType: { const: 'unknown' }, reason: { type: 'string' } },
    },
  ],
}

const EXTRACTION_PROMPT = `You are processing a scanned application form for the Village Common of Rhode Island.

First, identify the document type:
- A MEMBERSHIP application: return the "member" variant of the schema with all extracted fields.
- A VOLUNTEER application: return only {"applicationType": "volunteer"} for now.
- Anything else (blank form, wrong document, unreadable scan): return {"applicationType": "unknown", "reason": "<short explanation>"}.

For a membership application:
- The form may be filled in block-print style where all letters appear uppercase. Use letter size to infer true case: larger letters represent intended uppercase (start of a word or proper noun) and smaller letters represent intended lowercase. Apply standard title case to names, streets, and cities accordingly. Never return all-caps values for text fields.
- "members" holds one entry for a Single household. For a Dual household, extract the second household member's own fields as a second entry (never more than two entries). If the second person's field is blank on the form, use null — do not copy the first person's value.
- For any field that is blank or not filled in, use null.
- If "No Emergency Contact" is checked, return null for emergencyContact.
- Dates are YYYY-MM-DD.
- "uncertainFields": list ONLY fields whose values are genuinely ambiguous from the handwriting or scan quality — a digit that could be read two ways, a partially cut-off word, an ambiguous checkbox. For each, give the JSON path (e.g. "members[0].zip"), a short reason, and your best alternative reading (or null if none). Do not list fields you read confidently; an empty array means everything was clear.`

// --- assembly ---------------------------------------------------------------

function resolveVillage (villageName, villages) {
  if (!villageName) return { villageId: null, villageName: null }
  const needle = villageName.trim().toLowerCase()
  const match = villages.find(v => v.name.trim().toLowerCase() === needle)
  return { villageId: match?.villageId ?? null, villageName: match?.name ?? villageName.trim() }
}

function assembleResponse (data, villages, usage) {
  if (data.applicationType !== 'member') {
    return { ...data, usage }
  }
  const members = data.members.slice(0, 2).map(m => {
    const { pronouns, gender, veteran, accessibility, ...person } = m
    return { ...person, extras: { pronouns, gender, veteran, accessibility } }
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
    emergencyContact: data.emergencyContact,
    preferences,
    memberDefaults: {
      joinDate: data.application.applicationDate,
      printedNewsletter: newsletterPrint === 'Yes',
      duesMonthly, duesYearly, paymentMethod, invoiceMailed,
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

async function extractFromPdf (pdfBuffer) {
  if (!config.anthropic.apiKey) {
    const err = new Error('PDF extraction is not configured: VG_ANTHROPIC_API_KEY is not set.')
    err.status = 500
    throw err
  }
  const client = new Anthropic({ apiKey: config.anthropic.apiKey })
  let message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
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
          { type: 'text', text: EXTRACTION_PROMPT },
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
  // Structured outputs guarantee this parses and validates against EXTRACTION_SCHEMA
  return { data: JSON.parse(text), usage: computeCost(message.usage) }
}

module.exports = {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  resolveVillage,
  assembleResponse,
  computeCost,
  extractFromPdf,
}
