import { spawn } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_MAX_OUTPUT = 12_000

export function runCommand(command, args = [], {
  cwd,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutput = DEFAULT_MAX_OUTPUT,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('dsh-cli-store: timeoutMs must be positive')
  if (!Number.isFinite(maxOutput) || maxOutput < 0) throw new Error('dsh-cli-store: maxOutput must be non-negative')
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve({
        ok: result.ok ?? false,
        code: result.code ?? null,
        signal: result.signal ?? null,
        timedOut,
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        error: result.error,
      })
    }

    let child
    try {
      child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ error })
      return
    }

    let killTimer
    const append = (current, chunk) => {
      if (current.length >= maxOutput) return current
      return current + chunk.toString().slice(0, maxOutput - current.length)
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
    child.once('error', (error) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      finish({ error })
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      finish({ ok: code === 0 && !timedOut, code, signal })
    })
  })
}
