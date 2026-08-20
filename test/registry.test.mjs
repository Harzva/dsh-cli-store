import test from 'node:test'
import assert from 'node:assert/strict'
import { getEntry, loadRegistry, searchRegistry } from '../lib/registry.js'

test('registry has unique entries with platform installers', async () => {
  const entries = await loadRegistry()
  assert.equal(entries.length, 4)
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length)
  for (const entry of entries) assert.ok(entry.installers.length > 0)
})

test('search ranks exact CLI ids first', async () => {
  const results = await searchRegistry('gh', { platform: 'darwin' })
  assert.equal(results[0].id, 'gh')
})

test('search matches capabilities and filters unsupported platforms', async () => {
  const results = await searchRegistry('json', { platform: 'darwin' })
  assert.deepEqual(results.map((entry) => entry.id), ['jq'])
  assert.deepEqual(await searchRegistry('', { platform: 'freebsd' }), [])
})

test('unknown CLI produces a useful error', async () => {
  await assert.rejects(() => getEntry('does-not-exist'), /unknown CLI/)
})
