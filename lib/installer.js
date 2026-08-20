import { getEntry, INSTALLER_ACTIONS, isAvailableOnPlatform } from './registry.js'
import { runCommand } from './runner.js'

export const SAFE_MANAGERS = new Set(['brew', 'winget', 'cargo', 'npm', 'pnpm'])

function assertSafeCommand(command, args) {
  if (!SAFE_MANAGERS.has(command)) {
    throw new Error(`dsh-cli-store: installer command is not allowlisted: ${command}`)
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || /[;&|<>`$]/.test(arg))) {
    throw new Error('dsh-cli-store: installer arguments contain an unsafe value')
  }
  if (args[0] !== INSTALLER_ACTIONS.get(command)) {
    throw new Error(`dsh-cli-store: installer action is not allowlisted for ${command}`)
  }
}

export function selectInstaller(entry, { platform = process.platform, manager } = {}) {
  if (!isAvailableOnPlatform(entry, platform)) {
    throw new Error(`${entry.id} is not declared for platform ${platform}`)
  }
  const candidates = entry.installers.filter((installer) => (
    installer.platforms.includes(platform) && (!manager || installer.manager === manager)
  ))
  if (candidates.length === 0) {
    const suffix = manager ? ` with manager ${manager}` : ''
    throw new Error(`no installer is available for ${entry.id} on ${platform}${suffix}`)
  }
  const installer = candidates[0]
  assertSafeCommand(installer.command, installer.args)
  return installer
}

export function buildInstallPlan(entry, options = {}) {
  const installer = selectInstaller(entry, options)
  return {
    cli: entry.id,
    name: entry.name,
    platform: options.platform ?? process.platform,
    installer: installer.id,
    manager: installer.manager,
    command: installer.command,
    args: [...installer.args],
    displayCommand: [installer.command, ...installer.args].map((part) => (
      /[^A-Za-z0-9_./:=+-]/.test(part) ? JSON.stringify(part) : part
    )).join(' '),
    homepage: installer.homepage ?? entry.homepage,
  }
}

export async function doctorCli(id, { platform = process.platform, runner = runCommand } = {}) {
  const entry = await getEntry(id)
  if (!isAvailableOnPlatform(entry, platform)) {
    return {
      id: entry.id,
      name: entry.name,
      platform,
      installed: false,
      status: 'unsupported',
      version: null,
      detail: `${entry.name} is not declared for ${platform}`,
    }
  }
  const result = await runner(entry.command, entry.versionArgs ?? ['--version'], { timeoutMs: 10_000 })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  return {
    id: entry.id,
    name: entry.name,
    platform,
    installed: result.ok === true,
    status: result.ok === true ? 'installed' : 'missing',
    version: output.split('\n')[0] || null,
    detail: result.ok === true ? 'command responded successfully' : (result.error?.message ?? (output || 'command was not found')),
  }
}

export async function installCli(id, {
  platform = process.platform,
  manager,
  confirm = false,
  dryRun = true,
  runner = runCommand,
} = {}) {
  const entry = await getEntry(id)
  const plan = buildInstallPlan(entry, { platform, manager })
  if (!confirm) return { ...plan, status: 'confirmation-required', executed: false }
  if (dryRun) return { ...plan, status: 'dry-run', executed: false }

  const result = await runner(plan.command, plan.args, { timeoutMs: 180_000 })
  const verification = result.ok
    ? await doctorCli(id, { platform, runner })
    : null
  return {
    ...plan,
    status: result.ok ? (verification?.installed ? 'installed' : 'installed-unverified') : 'failed',
    executed: true,
    result: {
      ok: result.ok,
      code: result.code,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message ?? null,
    },
    verification,
  }
}
