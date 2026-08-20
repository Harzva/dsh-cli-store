import test from 'node:test'
import assert from 'node:assert/strict'
import { runCommand } from '../lib/runner.js'

test('runner caps stdout without using a shell', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], {
    maxOutput: 1000,
  })
  assert.equal(result.ok, true)
  assert.equal(result.stdout.length, 1000)
})

test('runner terminates commands that exceed the timeout', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
    timeoutMs: 50,
  })
  assert.equal(result.ok, false)
  assert.equal(result.timedOut, true)
})
