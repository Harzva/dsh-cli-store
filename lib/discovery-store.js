import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const STORE_VERSION = 1
const MAX_ENTRIES = 2_000

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function defaultStoreDirectory({ platformName = platform(), env = process.env, home = homedir() } = {}) {
  if (env.DSH_CLI_STORE_HOME) return env.DSH_CLI_STORE_HOME
  if (platformName === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'dsh-cli-store')
  if (platformName === 'darwin') return join(home, 'Library', 'Application Support', 'dsh-cli-store')
  return join(env.XDG_STATE_HOME ?? join(home, '.local', 'state'), 'dsh-cli-store')
}

function filePath(directory) {
  return join(directory, 'discovered.json')
}

function normalizeEntry(entry, now = new Date().toISOString()) {
  if (!entry || typeof entry !== 'object') return null
  const source = cleanText(entry.source, 40)
  const sourceId = cleanText(entry.sourceId, 200)
  if (!source || !sourceId) return null
  return {
    ...entry,
    id: `${source}:${sourceId}`,
    source,
    sourceId,
    name: cleanText(entry.name, 160) || sourceId,
    description: cleanText(entry.description, 500) || 'No description supplied by the source.',
    url: cleanText(entry.url, 500) || null,
    homepage: cleanText(entry.homepage, 500) || null,
    trust: entry.trust === 'source-verified' ? 'source-verified' : 'unreviewed',
    status: 'discovered',
    firstSeen: cleanText(entry.firstSeen, 40) || now,
    lastSeen: now,
  }
}

export async function loadDiscoveries({ directory = defaultStoreDirectory() } = {}) {
  try {
    const raw = await readFile(filePath(directory), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.entries)) return []
    return parsed.entries.map((entry) => normalizeEntry(entry, entry.firstSeen)).filter(Boolean).slice(0, MAX_ENTRIES)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(`dsh-cli-store: failed to read discovered catalog: ${error.message}`, { cause: error })
  }
}

export async function saveDiscoveries(entries, { directory = defaultStoreDirectory() } = {}) {
  const existing = await loadDiscoveries({ directory })
  const now = new Date().toISOString()
  const merged = new Map(existing.map((entry) => [entry.id, entry]))
  let added = 0
  let updated = 0
  for (const raw of entries) {
    const entry = normalizeEntry(raw, now)
    if (!entry) continue
    const previous = merged.get(entry.id)
    merged.set(entry.id, previous ? { ...previous, ...entry, firstSeen: previous.firstSeen, lastSeen: now } : entry)
    if (previous) updated += 1
    else added += 1
  }
  const output = Array.from(merged.values()).sort((left, right) => right.lastSeen.localeCompare(left.lastSeen)).slice(0, MAX_ENTRIES)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const target = filePath(directory)
  const temporary = join(directory, `.discovered.${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify({ version: STORE_VERSION, updatedAt: now, entries: output }, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, target)
  return { added, updated, total: output.length, entries: output }
}

export async function searchDiscoveries(query = '', { source, limit = 50, directory } = {}) {
  const normalized = cleanText(query, 120).toLowerCase()
  const max = Math.max(1, Math.min(Number(limit) || 50, MAX_ENTRIES))
  return (await loadDiscoveries({ directory }))
    .filter((entry) => !source || entry.source === source)
    .filter((entry) => !normalized || [entry.name, entry.description, entry.source, entry.sourceId, ...(entry.tags ?? [])].join(' ').toLowerCase().includes(normalized))
    .slice(0, max)
}
