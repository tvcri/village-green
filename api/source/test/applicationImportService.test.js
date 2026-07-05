'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../service/ApplicationImportService')

const villages = [
  { villageId: 1, name: 'Westside' },
  { villageId: 2, name: 'Harbor Point' },
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

function sampleExtraction () {
  return {
    applicationType: 'member',
    application: { applicationDate: '2026-06-12', villageName: 'Westside', ambassador: 'Pat Smith', householdType: 'Dual' },
    members: [
      {
        firstName: 'Marge', middleInitial: 'A', lastName: 'Innovera', nickname: null,
        pronouns: 'she/her', birthDate: '1948-03-02', gender: 'F', veteran: 'Yes',
        street: '12 Elm St', unit: null, city: 'Providence', state: 'RI', zip: '02901',
        email: 'marge@example.com', phone: '401-555-1111', cell: null,
        accessibility: { difficultyHearing: 'Sometimes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' },
      },
      {
        firstName: 'Al', middleInitial: null, lastName: 'Innovera', nickname: null,
        pronouns: null, birthDate: '1946-07-19', gender: 'M', veteran: 'No',
        street: null, unit: null, city: null, state: null, zip: null,
        email: null, phone: null, cell: '401-555-2222',
        accessibility: null,
      },
    ],
    emergencyContact: {
      firstName: 'Rob', middleInitial: null, lastName: 'Innovera',
      phoneHome: null, phoneCell: '401-555-3333', email: 'rob@example.com', relationship: 'Son',
    },
    preferences: {
      newsletterPrint: 'Yes', wantsVolunteerInfo: 'No',
      circleOfPrideJoin: 'No', circleOfPridePreferred: 'Yes',
      duesMonthly: null, duesYearly: 120, paymentMethod: 'Personal Check', invoiceMailed: 'Yes',
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
})

test('assembleResponse maps memberDefaults and resolves village', () => {
  const r = svc.assembleResponse(sampleExtraction(), villages, usage)
  assert.deepEqual(r.application.village, { villageId: 1, villageName: 'Westside' })
  assert.equal(r.memberDefaults.joinDate, '2026-06-12')
  assert.equal(r.memberDefaults.printedNewsletter, true)
  assert.equal(r.memberDefaults.duesYearly, 120)
  assert.equal(r.memberDefaults.paymentMethod, 'Personal Check')
  assert.deepEqual(r.preferences, { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'No', circleOfPridePreferred: 'Yes' })
  assert.deepEqual(r.usage, usage)
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
