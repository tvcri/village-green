'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const dbUtils = require('../service/utils')

// Pure SQL-construction helpers only — nothing here touches a connection.

// ---------------------------------------------------------------------------
// sqlGrantees — the grant-scoping subquery every scoped endpoint rides on.
// Effective grants are the union of direct and group-derived rows; the
// security property asserted throughout is that every filter predicate is
// applied to BOTH union arms (a filter that skipped the group arm would leak
// group-granted rows across the scope).
// ---------------------------------------------------------------------------

const occurrences = (sql, snippet) => sql.split(snippet).length - 1

test('sqlGrantees with no filters unions direct and group grants', () => {
  const sql = dbUtils.sqlGrantees({})
  assert.equal(occurrences(sql, ' union '), 1)
  assert.ok(sql.includes('cg.userId is not null'))          // direct arm
  assert.ok(sql.includes('cg.userGroupId is not null'))     // group arm
  assert.ok(sql.includes('inner join user_group_user_map'))
  // no stray filter predicates
  assert.ok(!sql.includes('ud.userId ='))
  assert.ok(!sql.includes('ud.username'))
  assert.ok(!sql.includes('cg.villageId IN'))
})

test('sqlGrantees applies the villageId filter to both union arms', () => {
  const sql = dbUtils.sqlGrantees({ villageId: 3 })
  assert.equal(occurrences(sql, 'cg.villageId = 3'), 2)
})

// Regression guard for finding A (fixed by #69; same mis-binding class as
// former e2e findings #3/#4 — see test/api/SECURITY-FINDINGS.md): villageIds
// is an array, and sqlGrantees used to bind [villageIds] into 'IN (?)',
// double-wrapping it. One village worked by accident (`IN ((5))`); two or more
// rendered a nested row constructor `IN ((1, 2))`, which MySQL rejects with
// ER_OPERAND_COLUMNS. Reachable: non-admin with grants on >=2 villages, via
// GET /villages?projection=statistics (VillageService.queryVillages ->
// cteGranteesParams.villageIds). Assert two villages, not one — a single-value
// case passes either way and would not catch a regression.
test('sqlGrantees renders a flat villageIds IN-list in both arms', () => {
  const sql = dbUtils.sqlGrantees({ villageIds: [1, 2] })
  assert.equal(occurrences(sql, 'cg.villageId IN (1, 2)'), 2,
    `expected a flat IN-list; got:\n${sql}`)
})

test('sqlGrantees applies the userId filter to both arms', () => {
  const sql = dbUtils.sqlGrantees({ userId: 5 })
  assert.equal(occurrences(sql, 'ud.userId = 5'), 2)
})

test('sqlGrantees username matching: exact by default, LIKE for the match variants', () => {
  assert.equal(occurrences(dbUtils.sqlGrantees({ username: 'ward' }), "ud.username = 'ward'"), 2)
  assert.equal(occurrences(dbUtils.sqlGrantees({ username: 'ward', nameMatch: 'exact' }), "ud.username = 'ward'"), 2)
  assert.equal(occurrences(dbUtils.sqlGrantees({ username: 'ward', nameMatch: 'startsWith' }), "ud.username LIKE 'ward%'"), 2)
  assert.equal(occurrences(dbUtils.sqlGrantees({ username: 'ward', nameMatch: 'endsWith' }), "ud.username LIKE '%ward'"), 2)
  assert.equal(occurrences(dbUtils.sqlGrantees({ username: 'ward', nameMatch: 'contains' }), "ud.username LIKE '%ward%'"), 2)
})

test('sqlGrantees escapes a hostile username instead of splicing it', () => {
  const sql = dbUtils.sqlGrantees({ username: "x'; drop table user_data; --" })
  assert.ok(!sql.includes("x'; drop"))
  assert.equal(occurrences(sql, "'x\\'; drop table user_data; --'"), 2)
})

test('sqlGrantees combines multiple filters with AND in both arms', () => {
  const sql = dbUtils.sqlGrantees({ villageId: 3, userId: 5 })
  assert.equal(occurrences(sql, 'cg.villageId = 3 and ud.userId = 5'), 2)
})

test('sqlGrantees omits the villageId column when includeColumnVillageId is false', () => {
  const sql = dbUtils.sqlGrantees({ includeColumnVillageId: false })
  assert.ok(!sql.includes('cg.villageId,'))
  const withCol = dbUtils.sqlGrantees({})
  assert.equal(occurrences(withCol, 'cg.villageId,'), 2)
})

test('sqlGrantees returnCte wraps the union as cteGrantees', () => {
  const sql = dbUtils.sqlGrantees({ returnCte: true })
  assert.ok(sql.startsWith('cteGrantees as ('))
  assert.ok(sql.endsWith(')'))
})

// ---------------------------------------------------------------------------
// makeQueryString
// ---------------------------------------------------------------------------

test('makeQueryString assembles the minimal select', () => {
  const sql = dbUtils.makeQueryString({ columns: ['a', 'b'], joins: ['t1', 'left join t2 on x'] })
  assert.match(sql, /SELECT\s+a,\s+b/)
  assert.match(sql, /FROM\s+t1\s+left join t2 on x/)
  assert.ok(!sql.includes('WHERE'))
  assert.ok(!sql.includes('WITH'))
})

test('makeQueryString prepends ctes with WITH and renders hints', () => {
  const sql = dbUtils.makeQueryString({
    ctes: ['c1 as (select 1)', 'c2 as (select 2)'],
    hints: ['NO_MERGE(c1)'],
    columns: ['a'],
    joins: ['t'],
  })
  assert.ok(sql.trimStart().startsWith('WITH c1 as (select 1)'))
  assert.ok(sql.includes('c2 as (select 2)'))
  assert.ok(sql.includes('/*+ NO_MERGE(c1) */') || sql.includes('/*+ NO_MERGE(c1)*/'))
})

test('makeQueryString joins predicate statements with and under WHERE', () => {
  const sql = dbUtils.makeQueryString({
    columns: ['a'],
    joins: ['t'],
    predicates: { statements: ['x = 1', 'y = 2'], binds: [] },
  })
  assert.match(sql, /WHERE\s+x = 1 and\s+y = 2/)
})

test('makeQueryString accepts Sets for joins and groupBy', () => {
  const sql = dbUtils.makeQueryString({
    columns: ['a'],
    joins: new Set(['t1', 't2']),
    groupBy: new Set(['a']),
    orderBy: ['a desc'],
  })
  assert.match(sql, /FROM\s+t1\s+t2/)
  assert.match(sql, /GROUP BY\s+a/)
  assert.match(sql, /ORDER BY\s+a desc/)
})

test('makeQueryString format:true substitutes the predicate binds', () => {
  const sql = dbUtils.makeQueryString({
    columns: ['a'],
    joins: ['t'],
    predicates: { statements: ['x = ?', "y = ?"], binds: [3, "it's"] },
    format: true,
  })
  assert.ok(sql.includes('x = 3'))
  assert.ok(sql.includes("y = 'it\\'s'"))
})

// ---------------------------------------------------------------------------
// small builders
// ---------------------------------------------------------------------------

test('uuidToSqlString wraps the escaped uuid in UUID_TO_BIN', () => {
  const v = dbUtils.uuidToSqlString('7f1c2ea2-0000-4000-8000-abcdefabcdef')
  assert.equal(v.toSqlString(), "UUID_TO_BIN('7f1c2ea2-0000-4000-8000-abcdefabcdef',1)")
})

test('jsonArrayAggDistinct builds the distinct group_concat cast', () => {
  assert.equal(
    dbUtils.jsonArrayAggDistinct('x'),
    `cast(concat('[', group_concat(distinct x), ']') as json)`
  )
})

test('jsonArrayAgg honors distinct and orderBy options', () => {
  assert.equal(dbUtils.jsonArrayAgg({ value: 'v' }), `cast(concat('[', group_concat(v ), ']') as json)`)
  assert.equal(
    dbUtils.jsonArrayAgg({ value: 'v', distinct: true }),
    `cast(concat('[', group_concat(distinct v ), ']') as json)`
  )
  assert.equal(
    dbUtils.jsonArrayAgg({ value: 'v', orderBy: 'v asc' }),
    `cast(concat('[', group_concat(v order by v asc), ']') as json)`
  )
})
