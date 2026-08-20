import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInstallPlan, doctorCli, installCli } from '../lib/installer.js'
import { getEntry } from '../lib/registry.js'

test('install plan is explicit and shell-free', async () => {
  const plan = buildInstallPlan(await getEntry('gh'), { platform: 'darwin' })
  assert.equal(plan.command, 'brew')
  assert.deepEqual(plan.args, ['install', 'gh'])
  assert.equal(plan.displayCommand, 'brew install gh')
})

test('install requires confirmation and defaults to dry-run', async () => {
  const preview = await installCli('gh', { platform: 'darwin' })
  assert.equal(preview.status, 'confirmation-required')
  assert.equal(preview.executed, false)

  const dryRun = await installCli('gh', { platform: 'darwin', confirm: true })
  assert.equal(dryRun.status, 'dry-run')
  assert.equal(dryRun.executed, false)
})

test('manual official installers return instructions without executing a script', async () => {
  const plan = buildInstallPlan(await getEntry('workbench'), { platform: 'darwin' })
  assert.equal(plan.manager, 'manual')
  assert.equal(plan.command, null)
  assert.match(plan.documentation, /aliyun\.com|aliyuncs\.com/)

  const result = await installCli('workbench', {
    platform: 'darwin',
    confirm: true,
    dryRun: false,
    runner: async () => { throw new Error('manual install must not execute') },
  })
  assert.equal(result.status, 'manual-install-required')
  assert.equal(result.executed, false)
})

test('confirmed install delegates only the manifest command', async () => {
  const calls = []
  const result = await installCli('gh', {
    platform: 'darwin',
    confirm: true,
    dryRun: false,
    runner: async (command, args) => {
      calls.push({ command, args })
      return { ok: true, code: 0, stdout: 'installed', stderr: '', timedOut: false }
    },
  })
  assert.equal(result.status, 'installed')
  assert.equal(result.verification.status, 'installed')
  assert.deepEqual(calls, [
    { command: 'brew', args: ['install', 'gh'] },
    { command: 'gh', args: ['--version'] },
  ])
})

test('doctor reports an installed CLI without invoking a shell', async () => {
  const calls = []
  const result = await doctorCli('gh', {
    platform: 'darwin',
    runner: async (command, args) => {
      calls.push({ command, args })
      return { ok: true, stdout: 'gh version 2.0.0', stderr: '' }
    },
  })
  assert.equal(result.status, 'installed')
  assert.equal(result.version, 'gh version 2.0.0')
  assert.deepEqual(calls, [{ command: 'gh', args: ['--version'] }])
})

test('unsupported platform is reported before command execution', async () => {
  const result = await doctorCli('gh', { platform: 'freebsd', runner: async () => { throw new Error('must not run') } })
  assert.equal(result.status, 'unsupported')
})
