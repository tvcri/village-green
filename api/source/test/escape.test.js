'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const escape = require('../utils/escape')

test('escapeForXml replaces the five XML-reserved characters', () => {
  // first parameter (name) is unused by the implementation
  assert.equal(
    escape.escapeForXml(undefined, `<a & "b" 'c'>`),
    '&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;'
  )
})

test('escapeForXml stringifies non-string input and passes safe text through', () => {
  assert.equal(escape.escapeForXml(undefined, 42), '42')
  assert.equal(escape.escapeForXml(undefined, 'plain text'), 'plain text')
})

test('escapeFilename replaces OS-reserved characters with entities', () => {
  assert.equal(
    escape.escapeFilename('a/b\\c:d*e"f?g<h>i|j'),
    'a&sol;b&bsol;c&colon;d&ast;e&quot;f&quest;g&lt;h&gt;i&vert;j'
  )
})

test('escapeFilename encodes control characters and truncates to 255', () => {
  // note: the entity uses an &#x prefix around the DECIMAL char code —
  // characterized as-is (tab = 9 → &#x09;)
  assert.equal(escape.escapeFilename('a\tb'), 'a&#x09;b')
  assert.equal(escape.escapeFilename('x'.repeat(300)).length, 255)
})

test('filenameComponentFromDate strips colons and fractional seconds', () => {
  assert.equal(
    escape.filenameComponentFromDate(new Date('2026-07-15T12:34:56.789Z')),
    '2026-07-15T1234Z'
  )
})
