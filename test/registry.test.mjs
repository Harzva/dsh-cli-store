import test from 'node:test'
import assert from 'node:assert/strict'
import { getEntry, loadRegistry, searchRegistry, validateEntry } from '../lib/registry.js'

test('registry has unique entries with platform installers', async () => {
  const entries = await loadRegistry()
  assert.equal(entries.length, 5)
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length)
  for (const entry of entries) assert.ok(entry.installers.length > 0)
  const workbench = entries.find((entry) => entry.id === 'workbench')
  assert.equal(workbench.installers[0].manager, 'manual')
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

test('manual installers are documented but never treated as shell commands', async () => {
  const entry = await getEntry('workbench')
  validateEntry(entry)
  assert.equal(entry.installers[0].manager, 'manual')
  assert.match(entry.installers[0].url, /^https:\/\//)
})

test('unknown CLI produces a useful error', async () => {
  await assert.rejects(() => getEntry('does-not-exist'), /unknown CLI/)
})

test('registry validation rejects unsafe or incomplete installer metadata', () => {
  const entry = {
    id: 'bad-entry',
    name: 'Bad entry',
    command: 'bad',
    versionArgs: ['--version'],
    description: { en: 'Bad.', zh: '错误。' },
    homepage: 'https://example.com',
    license: 'MIT',
    platforms: ['darwin'],
    installers: [{
      id: 'bad',
      manager: 'brew',
      platforms: ['darwin'],
      command: 'brew',
      args: ['run', 'bad'],
    }],
  }
  assert.throws(() => validateEntry(entry), /installer action is not allowlisted|must be allowlisted/)
})
