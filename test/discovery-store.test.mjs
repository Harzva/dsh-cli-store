import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDiscoveries, saveDiscoveries, searchDiscoveries } from '../lib/discovery-store.js'

test('discovery store merges entries by source identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cli-store-test-'))
  try {
    const first = await saveDiscoveries([
      { source: 'github', sourceId: 'example/image-cli', name: 'example/image-cli', description: 'First', url: 'https://github.com/example/image-cli', trust: 'unreviewed' },
    ], { directory })
    assert.equal(first.added, 1)
    const second = await saveDiscoveries([
      { source: 'github', sourceId: 'example/image-cli', name: 'example/image-cli', description: 'Updated', url: 'https://github.com/example/image-cli', trust: 'unreviewed' },
      { source: 'npm', sourceId: 'image-cli', name: 'image-cli', description: 'Package', url: 'https://www.npmjs.com/package/image-cli', trust: 'unreviewed' },
    ], { directory })
    assert.equal(second.added, 1)
    assert.equal(second.updated, 1)
    assert.equal((await loadDiscoveries({ directory })).length, 2)
    assert.equal((await searchDiscoveries('updated', { directory }))[0].sourceId, 'example/image-cli')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
