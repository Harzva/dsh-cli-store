import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const registryPath = fileURLToPath(new URL('../data/registry.json', import.meta.url))
const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'win32'])
const INSTALLER_MANAGERS = new Set(['brew', 'winget', 'cargo', 'npm', 'pnpm'])
export const INSTALLER_ACTIONS = new Map([
  ['brew', 'install'],
  ['winget', 'install'],
  ['cargo', 'install'],
  ['npm', 'install'],
  ['pnpm', 'add'],
])
let registryPromise

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`dsh-cli-store: ${label} must be a non-empty string`)
  }
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('registry entry must be an object')
  assertString(entry.id, 'entry.id')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.id)) throw new Error(`${entry.id}.id must be a lowercase slug`)
  assertString(entry.name, `${entry.id}.name`)
  assertString(entry.command, `${entry.id}.command`)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.command)) throw new Error(`${entry.id}.command must be a command name`)
  if (!entry.description || typeof entry.description !== 'object') throw new Error(`${entry.id}.description must be an object`)
  assertString(entry.description.en, `${entry.id}.description.en`)
  assertString(entry.description.zh, `${entry.id}.description.zh`)
  assertString(entry.homepage, `${entry.id}.homepage`)
  if (!/^https:\/\//.test(entry.homepage)) throw new Error(`${entry.id}.homepage must use https`)
  assertString(entry.license, `${entry.id}.license`)
  if (!Array.isArray(entry.platforms) || entry.platforms.length === 0) {
    throw new Error(`${entry.id}.platforms must be a non-empty array`)
  }
  if (new Set(entry.platforms).size !== entry.platforms.length) throw new Error(`${entry.id}.platforms contains duplicates`)
  for (const platform of entry.platforms) {
    if (!SUPPORTED_PLATFORMS.has(platform)) throw new Error(`${entry.id}.platforms contains unsupported platform: ${platform}`)
  }
  if (!Array.isArray(entry.versionArgs) || entry.versionArgs.length === 0 || entry.versionArgs.some((arg) => typeof arg !== 'string')) {
    throw new Error(`${entry.id}.versionArgs must be a non-empty array of strings`)
  }
  if (!Array.isArray(entry.installers)) throw new Error(`${entry.id}.installers must be an array`)
  const installerIds = new Set()
  for (const installer of entry.installers) {
    assertString(installer.id, `${entry.id}.installer.id`)
    assertString(installer.manager, `${entry.id}.installer.manager`)
    assertString(installer.command, `${entry.id}.installer.command`)
    if (installerIds.has(installer.id)) throw new Error(`${entry.id}.installers contains duplicate id: ${installer.id}`)
    installerIds.add(installer.id)
    if (!INSTALLER_MANAGERS.has(installer.manager)) throw new Error(`${entry.id}.${installer.id}.manager is not allowlisted`)
    if (installer.command !== installer.manager) throw new Error(`${entry.id}.${installer.id}.command must match manager`)
    if (!Array.isArray(installer.args) || installer.args.some((arg) => typeof arg !== 'string')) {
      throw new Error(`${entry.id}.${installer.id}.args must be an array of strings`)
    }
    if (installer.args[0] !== INSTALLER_ACTIONS.get(installer.manager)) {
      throw new Error(`${entry.id}.${installer.id}.installer action is not allowlisted`)
    }
    if (!Array.isArray(installer.platforms) || installer.platforms.length === 0) {
      throw new Error(`${entry.id}.${installer.id}.platforms must be a non-empty array`)
    }
    if (new Set(installer.platforms).size !== installer.platforms.length) throw new Error(`${entry.id}.${installer.id}.platforms contains duplicates`)
    for (const platform of installer.platforms) {
      if (!entry.platforms.includes(platform)) throw new Error(`${entry.id}.${installer.id} is not covered by entry.platforms: ${platform}`)
    }
  }
  return entry
}

export function resetRegistryCache() {
  registryPromise = undefined
}

export function loadRegistry() {
  if (registryPromise === undefined) {
    registryPromise = readFile(registryPath, 'utf8')
      .then((raw) => JSON.parse(raw))
      .then((entries) => {
        if (!Array.isArray(entries)) throw new Error('dsh-cli-store: registry root must be an array')
        const seen = new Set()
        return entries.map((entry) => {
          validateEntry(entry)
          const id = normalize(entry.id)
          if (seen.has(id)) throw new Error(`dsh-cli-store: duplicate registry id: ${id}`)
          seen.add(id)
          return entry
        })
      })
      .catch((error) => {
        registryPromise = undefined
        throw new Error(`dsh-cli-store: failed to load registry: ${error.message}`, { cause: error })
      })
  }
  return registryPromise
}

export function isAvailableOnPlatform(entry, platform = process.platform) {
  return entry.platforms.includes(platform)
}

export async function getEntry(id) {
  const normalizedId = normalize(id)
  if (!normalizedId) throw new Error('dsh-cli-store: id is required')
  const entry = (await loadRegistry()).find((candidate) => normalize(candidate.id) === normalizedId)
  if (!entry) throw new Error(`dsh-cli-store: unknown CLI: ${id}`)
  return entry
}

function scoreEntry(entry, query) {
  if (!query) return 0
  const haystack = [
    entry.id,
    entry.name,
    entry.description?.en,
    entry.description?.zh,
    ...(entry.capabilities ?? []),
  ].join(' ').toLowerCase()
  if (normalize(entry.id) === query) return 100
  if (normalize(entry.name) === query) return 90
  if (haystack.startsWith(query)) return 70
  if (haystack.includes(query)) return 40
  return -1
}

export async function searchRegistry(query = '', { platform = process.platform } = {}) {
  const normalizedQuery = normalize(query)
  return (await loadRegistry())
    .filter((entry) => isAvailableOnPlatform(entry, platform))
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter(({ score }) => !normalizedQuery || score >= 0)
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name))
    .map(({ entry }) => entry)
}

export function publicEntry(entry, platform = process.platform) {
  return {
    id: entry.id,
    name: entry.name,
    command: entry.command,
    description: entry.description,
    homepage: entry.homepage,
    license: entry.license,
    platforms: entry.platforms,
    capabilities: entry.capabilities ?? [],
    installers: entry.installers
      .filter((installer) => installer.platforms.includes(platform))
      .map((installer) => ({ id: installer.id, manager: installer.manager })),
  }
}
