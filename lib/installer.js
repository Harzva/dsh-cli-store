import { getEntry, INSTALLER_ACTIONS, isAvailableOnPlatform } from './registry.js'
import { loadDiscoveries } from './discovery-store.js'
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
  if (installer.manager !== 'manual') assertSafeCommand(installer.command, installer.args)
  return installer
}

export function buildInstallPlan(entry, options = {}) {
  const installer = selectInstaller(entry, options)
  const plan = {
    cli: entry.id,
    name: entry.name,
    platform: options.platform ?? process.platform,
    installer: installer.id,
    manager: installer.manager,
    homepage: installer.homepage ?? entry.homepage,
  }
  if (installer.manager === 'manual') {
    return {
      ...plan,
      command: null,
      args: [],
      displayCommand: null,
      documentation: installer.url,
      instructions: installer.instructions,
    }
  }
  return {
    ...plan,
    command: installer.command,
    args: [...installer.args],
    displayCommand: [installer.command, ...installer.args].map((part) => (
      /[^A-Za-z0-9_./:=+-]/.test(part) ? JSON.stringify(part) : part
    )).join(' '),
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
  if (plan.manager === 'manual') return { ...plan, status: 'manual-install-required', executed: false }
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

function discoveredPlan(entry) {
  const proposed = entry.installPlan
  if (!proposed || typeof proposed !== 'object') return null
  assertSafeCommand(proposed.command, proposed.args)
  return {
    cli: entry.id,
    name: entry.name,
    source: entry.source,
    trust: entry.trust,
    platform: process.platform,
    installer: `${entry.source}:${proposed.manager}`,
    manager: proposed.manager,
    command: proposed.command,
    args: [...proposed.args],
    displayCommand: [proposed.command, ...proposed.args].map((part) => (
      /[^A-Za-z0-9_./:=+-]/.test(part) ? JSON.stringify(part) : part
    )).join(' '),
    homepage: entry.homepage ?? entry.url,
  }
}

export async function installDiscoveredCli(id, {
  directory,
  confirm = false,
  dryRun = true,
  runner = runCommand,
} = {}) {
  const entry = (await loadDiscoveries({ directory })).find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`dsh-cli-store: unknown saved discovery: ${id}`)
  if (entry.trust !== 'source-verified') {
    return {
      cli: entry.id,
      name: entry.name,
      source: entry.source,
      trust: entry.trust,
      status: 'review-required',
      executed: false,
      reason: 'This discovery has no approved installer plan; promote it to the curated registry after review.',
    }
  }
  let plan
  try {
    plan = discoveredPlan(entry)
  } catch {
    return {
      cli: entry.id,
      name: entry.name,
      source: entry.source,
      trust: entry.trust,
      status: 'review-required',
      executed: false,
      reason: 'This discovery has an invalid installer plan; promote it to the curated registry after review.',
    }
  }
  if (plan === null) {
    return {
      cli: entry.id,
      name: entry.name,
      source: entry.source,
      trust: entry.trust,
      status: 'review-required',
      executed: false,
      reason: 'This discovery has no approved installer plan; promote it to the curated registry after review.',
    }
  }
  if (entry.metadata?.deprecated === true || entry.metadata?.disabled === true) {
    return {
      ...plan,
      status: 'review-required',
      executed: false,
      reason: 'This source marks the formula as deprecated or disabled; promote it to the curated registry only after review.',
    }
  }
  if (!Array.isArray(entry.installPlan?.platforms) || !entry.installPlan.platforms.includes(process.platform)) {
    return {
      ...plan,
      status: 'unsupported',
      executed: false,
      reason: `This discovery does not declare an installer for ${process.platform}.`,
    }
  }
  if (!confirm) return { ...plan, status: 'confirmation-required', executed: false }
  if (dryRun) return { ...plan, status: 'dry-run', executed: false }
  const result = await runner(plan.command, plan.args, { timeoutMs: 180_000 })
  return {
    ...plan,
    status: result.ok ? 'installed-unverified' : 'failed',
    executed: true,
    result: {
      ok: result.ok,
      code: result.code,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message ?? null,
    },
  }
}
