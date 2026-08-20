import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installDiscoveredCli } from '../lib/installer.js'
import { saveDiscoveries } from '../lib/discovery-store.js'

test('only source-verified discoveries can reach the guarded installer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cli-store-installer-'))
  try {
    await saveDiscoveries([
      {
        source: 'homebrew',
        sourceId: 'image-cli',
        name: 'image-cli',
        description: 'Image CLI',
        url: 'https://formulae.brew.sh/formula/image-cli',
        trust: 'source-verified',
        installPlan: { manager: 'brew', command: 'brew', args: ['install', 'image-cli'], platforms: ['darwin', 'linux'] },
      },
      {
        source: 'npm',
        sourceId: 'image-cli',
        name: 'image-cli',
        description: 'npm Image CLI',
        url: 'https://www.npmjs.com/package/image-cli',
        trust: 'unreviewed',
      },
      {
        source: 'homebrew',
        sourceId: 'disabled-cli',
        name: 'disabled-cli',
        description: 'Disabled CLI',
        trust: 'source-verified',
        metadata: { disabled: true },
        installPlan: { manager: 'brew', command: 'brew', args: ['install', 'disabled-cli'], platforms: ['darwin', 'linux'] },
      },
      {
        source: 'homebrew',
        sourceId: 'windows-only-cli',
        name: 'windows-only-cli',
        description: 'Windows only CLI',
        trust: 'source-verified',
        installPlan: { manager: 'brew', command: 'brew', args: ['install', 'windows-only-cli'], platforms: ['win32'] },
      },
    ], { directory })

    const review = await installDiscoveredCli('npm:image-cli', { directory, confirm: true, dryRun: false, runner: async () => { throw new Error('must not run') } })
    assert.equal(review.status, 'review-required')

    const disabled = await installDiscoveredCli('homebrew:disabled-cli', { directory, confirm: true, dryRun: false, runner: async () => { throw new Error('must not run') } })
    assert.equal(disabled.status, 'review-required')

    const unsupported = await installDiscoveredCli('homebrew:windows-only-cli', { directory, confirm: true, dryRun: false, runner: async () => { throw new Error('must not run') } })
    assert.equal(unsupported.status, 'unsupported')

    const preview = await installDiscoveredCli('homebrew:image-cli', { directory })
    assert.equal(preview.status, 'confirmation-required')

    const calls = []
    const installed = await installDiscoveredCli('homebrew:image-cli', {
      directory,
      confirm: true,
      dryRun: false,
      runner: async (command, args) => {
        calls.push({ command, args })
        return { ok: true, code: 0, timedOut: false, stdout: 'ok', stderr: '' }
      },
    })
    assert.equal(installed.status, 'installed-unverified')
    assert.deepEqual(calls, [{ command: 'brew', args: ['install', 'image-cli'] }])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
