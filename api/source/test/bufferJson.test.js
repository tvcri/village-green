'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const bufferJson = require('../utils/buffer-json')

test('stringify/parse round-trips an object containing a Buffer', () => {
  const original = { name: 'seal.png', data: Buffer.from([1, 2, 3, 255]) }
  const restored = bufferJson.parse(bufferJson.stringify(original))
  assert.equal(restored.name, 'seal.png')
  assert.ok(Buffer.isBuffer(restored.data))
  assert.deepEqual(restored.data, original.data)
})

test('stringify encodes buffer bytes as a base64: string', () => {
  const text = bufferJson.stringify({ b: Buffer.from('hi') })
  const raw = JSON.parse(text)
  assert.equal(raw.b.type, 'Buffer')
  assert.equal(raw.b.data, 'base64:' + Buffer.from('hi').toString('base64'))
})

test('empty buffers round-trip as empty', () => {
  const restored = bufferJson.parse(bufferJson.stringify({ b: Buffer.alloc(0) }))
  assert.ok(Buffer.isBuffer(restored.b))
  assert.equal(restored.b.length, 0)
})

test('parse treats buffer-like string data without the base64 prefix as UTF-8', () => {
  const restored = bufferJson.parse('{"b":{"type":"Buffer","data":"plain"}}')
  assert.ok(Buffer.isBuffer(restored.b))
  assert.equal(restored.b.toString('utf8'), 'plain')
})

test('values that only resemble buffers are left alone', () => {
  const restored = bufferJson.parse('{"b":{"type":"NotBuffer","data":[1]},"n":5,"s":"x"}')
  assert.deepEqual(restored, { b: { type: 'NotBuffer', data: [1] }, n: 5, s: 'x' })
})
