'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../service/ApplicationImportService')

const villages = [
  { villageId: 1, name: 'Westside' },
  { villageId: 2, name: 'Harbor Point' },
  { villageId: 3, name: 'Warwick' },
]

test('resolveVillage matches case-insensitively with trim', () => {
  assert.deepEqual(svc.resolveVillage('  westside ', villages), { villageId: 1, villageName: 'Westside' })
})

test('resolveVillage returns null id for unknown name, preserving raw name', () => {
  assert.deepEqual(svc.resolveVillage('Nowhere', villages), { villageId: null, villageName: 'Nowhere' })
})

test('resolveVillage handles null name', () => {
  assert.deepEqual(svc.resolveVillage(null, villages), { villageId: null, villageName: null })
})

test('resolveVillage ignores the word "village" and punctuation', () => {
  assert.deepEqual(svc.resolveVillage('Warwick Village', villages), { villageId: 3, villageName: 'Warwick' })
  assert.deepEqual(svc.resolveVillage('Village of Harbor-Point', villages), { villageId: 2, villageName: 'Harbor Point' })
})

test('resolveVillage falls back to a unique substring match', () => {
  assert.deepEqual(svc.resolveVillage('Harbor', villages), { villageId: 2, villageName: 'Harbor Point' })
  assert.deepEqual(svc.resolveVillage('The Westside Community', villages), { villageId: 1, villageName: 'Westside' })
  assert.deepEqual(svc.resolveVillage('Nowhere', villages), { villageId: null, villageName: 'Nowhere' })
})

test('resolveVillage returns no match when substring is ambiguous', () => {
  const ambiguous = [...villages, { villageId: 4, name: 'Harbor East' }]
  assert.deepEqual(svc.resolveVillage('Harbor', ambiguous), { villageId: null, villageName: 'Harbor' })
})

// Fixture is in the schema's null-free shape: blanks are "" and dues are
// digit strings; assembleResponse normalizes back to the null-based contract.
function sampleExtraction () {
  return {
    applicationType: 'member',
    application: { applicationDate: '2026-06-12', villageName: 'Westside', ambassador: 'Pat Smith', householdType: 'Dual' },
    members: [
      {
        firstName: 'Marge', middleInitial: 'A', lastName: 'Innovera', nickname: '',
        pronouns: 'she/her', birthDate: '1948-03-02', gender: 'F', veteran: 'Yes',
        street: '12 Elm St', unit: '', city: 'Providence', state: 'RI', zip: '02901',
        email: 'marge@example.com', phone: '401-555-1111', cell: '',
        accessibility: { difficultyHearing: 'Sometimes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' },
        accessibilityNotes: '',
      },
      {
        firstName: 'Al', middleInitial: '', lastName: 'Innovera', nickname: '',
        pronouns: '', birthDate: '1946-07-19', gender: 'M', veteran: 'No',
        street: '', unit: '', city: '', state: '', zip: '',
        email: '', phone: '', cell: '401-555-2222',
        accessibility: { difficultyHearing: '', visionLimited: '', usesWalker: '', usesCane: '', usesWheelchair: '' },
        accessibilityNotes: 'Vision limited: needs glasses. Uses walker: rollator for travel.',
      },
    ],
    emergencyContact: {
      firstName: 'Rob', middleInitial: '', lastName: 'Innovera',
      phoneHome: '', phoneCell: '401-555-3333', email: 'rob@example.com', relationship: 'Son',
    },
    preferences: {
      newsletterPrint: 'Yes', wantsVolunteerInfo: 'No',
      circleOfPrideJoin: 'No', circleOfPridePreferred: 'Yes',
      duesMonthly: '', duesYearly: '120', paymentMethod: 'Personal Check', invoiceMailed: 'Yes',
    },
    uncertainFields: [{ path: 'members[0].zip', reason: 'last digit ambiguous', alternative: '02907' }],
  }
}

const usage = { inputTokens: 5000, outputTokens: 900, cost: 0.0475 }

test('assembleResponse splits person fields from extras', () => {
  const r = svc.assembleResponse(sampleExtraction(), villages, usage)
  assert.equal(r.members[0].firstName, 'Marge')
  assert.equal(r.members[0].pronouns, undefined)
  assert.deepEqual(r.members[0].extras.accessibility.difficultyHearing, 'Sometimes')
  assert.equal(r.members[0].extras.veteran, 'Yes')
  assert.equal(r.members[0].extras.accessibilityNotes, null)
  assert.equal(r.members[1].extras.accessibilityNotes, 'Vision limited: needs glasses. Uses walker: rollator for travel.')
})

test('assembleResponse maps memberDefaults and resolves village', () => {
  const r = svc.assembleResponse(sampleExtraction(), villages, usage)
  assert.deepEqual(r.application.village, { villageId: 1, villageName: 'Westside' })
  assert.equal(r.memberDefaults.joinDate, '2026-06-12')
  assert.equal(r.memberDefaults.printedNewsletter, true)
  assert.equal(r.memberDefaults.duesYearly, 120)
  assert.equal(r.memberDefaults.duesMonthly, null)
  assert.equal(r.memberDefaults.paymentMethod, 'Personal Check')
  assert.deepEqual(r.preferences, { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'No', circleOfPridePreferred: 'Yes' })
  assert.deepEqual(r.usage, usage)
})

test('assembleResponse normalizes blanks to nulls and collapses all-empty objects', () => {
  const r = svc.assembleResponse(sampleExtraction(), villages, usage)
  assert.equal(r.members[0].nickname, null)
  assert.equal(r.members[1].street, null)
  assert.equal(r.members[1].extras.pronouns, null)
  assert.equal(r.members[1].extras.accessibility, null)      // all answers blank
  assert.equal(r.emergencyContact.phoneHome, null)            // partially filled stays an object
  assert.equal(r.emergencyContact.firstName, 'Rob')
})

test('assembleResponse nulls an all-empty emergencyContact', () => {
  const data = sampleExtraction()
  data.emergencyContact = {
    firstName: '', middleInitial: '', lastName: '',
    phoneHome: '', phoneCell: '', email: '', relationship: '',
  }
  const r = svc.assembleResponse(data, villages, usage)
  assert.equal(r.emergencyContact, null)
})

test('EXTRACTION_SCHEMA stays under the 16-union structured-outputs cap', () => {
  let unions = 0
  function walk (node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.type) || Array.isArray(node.anyOf)) unions++
    for (const v of Object.values(node)) walk(v)
  }
  walk(svc.EXTRACTION_SCHEMA)
  assert.ok(unions <= 16, `schema has ${unions} union-typed parameters (limit 16)`)
})

test('assembleResponse caps members at two entries', () => {
  const data = sampleExtraction()
  data.members.push({ ...data.members[1], firstName: 'Ghost' })
  const r = svc.assembleResponse(data, villages, usage)
  assert.equal(r.members.length, 2)
})

test('assembleResponse passes volunteer/unknown variants through with usage', () => {
  const r = svc.assembleResponse({ applicationType: 'volunteer' }, villages, usage)
  assert.deepEqual(r, { applicationType: 'volunteer', usage })
  const u = svc.assembleResponse({ applicationType: 'unknown', reason: 'blank form' }, villages, usage)
  assert.deepEqual(u, { applicationType: 'unknown', reason: 'blank form', usage })
})

test('computeCost prices opus-4-8 tokens', () => {
  const c = svc.computeCost({ input_tokens: 1_000_000, output_tokens: 1_000_000 })
  assert.deepEqual(c, { inputTokens: 1_000_000, outputTokens: 1_000_000, cost: 30 })
})

test('EXTRACTION_SCHEMA objects all forbid additional properties', () => {
  const failures = []
  function walk (node, where) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))) {
      if (node.additionalProperties !== false) failures.push(where)
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`)
  }
  walk(svc.EXTRACTION_SCHEMA, '$')
  assert.deepEqual(failures, [])
})
