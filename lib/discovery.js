const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
const DEFAULT_TIMEOUT_MS = 12_000

export const DISCOVERY_SOURCES = Object.freeze(['npm', 'github', 'homebrew', 'crates'])

function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength)
}

function normalizeQuery(value) {
  return cleanText(value, 120).replace(/\s+/g, ' ')
}

function clampLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('dsh-cli-store: discovery limit must be a positive integer')
  return Math.min(parsed, MAX_LIMIT)
}

function termsMatch(value, query) {
  const haystack = cleanText(value, 2000).toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term))
}

function safeUrl(value, fallback = null) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : fallback
  } catch {
    return fallback
  }
}

function candidate({ source, sourceId, name, description, url, homepage, version, license, tags = [], trust, installPlan, metadata = {} }) {
  return {
    id: `${source}:${sourceId}`,
    source,
    sourceId: cleanText(sourceId, 200),
    name: cleanText(name, 160) || cleanText(sourceId, 160),
    description: cleanText(description, 500) || 'No description supplied by the source.',
    url: safeUrl(url, null),
    homepage: safeUrl(homepage, safeUrl(url, null)),
    version: cleanText(version, 80) || null,
    license: cleanText(license, 120) || null,
    tags: Array.from(new Set(tags.filter((tag) => typeof tag === 'string').map((tag) => cleanText(tag, 60)).filter(Boolean))).slice(0, 20),
    trust,
    installPlan: installPlan ?? null,
    metadata,
    status: 'discovered',
  }
}

export async function fetchJson(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('dsh-cli-store: discovery requests must use HTTPS')
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'dsh-cli-store/0.2.0 (+https://github.com/Harzva/dsh-cli-store)',
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${parsed.hostname}`)
  return response.json()
}

async function discoverNpm(query, { limit, request }) {
  const url = new URL('https://registry.npmjs.org/-/v1/search')
  url.searchParams.set('text', query)
  url.searchParams.set('size', String(limit))
  const body = await request(url.toString())
  return (Array.isArray(body.objects) ? body.objects : []).map((item) => {
    const pkg = item.package ?? {}
    const links = pkg.links ?? {}
    return candidate({
      source: 'npm',
      sourceId: pkg.name,
      name: pkg.name,
      description: pkg.description,
      url: links.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(pkg.name ?? '')}`,
      homepage: links.homepage ?? links.repository,
      version: pkg.version,
      tags: pkg.keywords ?? [],
      trust: 'unreviewed',
      metadata: {
        score: item.score?.final ?? null,
        publisher: cleanText(pkg.publisher?.username, 100) || null,
        date: cleanText(pkg.date, 40) || null,
      },
    })
  }).filter((item) => item.sourceId)
}

async function discoverGithub(query, { limit, request }) {
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', `${query} topic:cli`)
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(limit))
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const body = await request(url.toString(), { headers })
  return (Array.isArray(body.items) ? body.items : []).map((repo) => candidate({
    source: 'github',
    sourceId: repo.full_name,
    name: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    homepage: repo.homepage,
    tags: repo.topics ?? [],
    trust: 'unreviewed',
    metadata: {
      stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
      forks: Number.isFinite(repo.forks_count) ? repo.forks_count : 0,
      language: cleanText(repo.language, 80) || null,
      archived: repo.archived === true,
      updatedAt: cleanText(repo.updated_at, 40) || null,
    },
  })).filter((item) => item.sourceId && item.url)
}

async function discoverHomebrew(query, { limit, request }) {
  const exact = query.match(/^[a-z0-9][a-z0-9+._-]*$/i)
  if (exact) {
    try {
      const formula = await request(`https://formulae.brew.sh/api/formula/${encodeURIComponent(query)}.json`, { timeoutMs: 15_000 })
      if (formula && typeof formula === 'object' && Array.isArray(formula.executables) && formula.executables.length > 0) {
        return [homebrewCandidate(formula)]
      }
    } catch {
      // A natural-language query is not a formula name; fall back to the catalog below.
    }
  }
  const body = await request('https://formulae.brew.sh/api/formula.json', { timeoutMs: 45_000 })
  const formulas = Array.isArray(body) ? body : []
  return formulas
    .filter((formula) => {
      const executables = Array.isArray(formula.executables) ? formula.executables : []
      const haystack = [formula.name, formula.full_name, formula.desc, ...(formula.aliases ?? []), ...executables].join(' ')
      return executables.length > 0 && termsMatch(haystack, query)
    })
    .slice(0, limit)
    .map(homebrewCandidate)
}

function homebrewCandidate(formula) {
  const name = cleanText(formula.name, 120)
  return candidate({
    source: 'homebrew',
    sourceId: name,
    name,
    description: formula.desc,
    url: `https://formulae.brew.sh/formula/${encodeURIComponent(name)}`,
    homepage: formula.homepage,
    version: formula.versions?.stable,
    license: formula.license,
    tags: formula.executables ?? [],
    trust: 'source-verified',
    installPlan: {
      manager: 'brew',
      command: 'brew',
      args: ['install', name],
      platforms: ['darwin', 'linux'],
      requiresReview: true,
    },
    metadata: {
      executables: (formula.executables ?? []).slice(0, 20),
      deprecated: formula.deprecated === true,
      disabled: formula.disabled === true,
    },
  })
}

async function discoverCrates(query, { limit, request }) {
  const url = new URL('https://crates.io/api/v1/crates')
  url.searchParams.set('q', query)
  url.searchParams.set('per_page', String(limit))
  const body = await request(url.toString(), { headers: { 'user-agent': 'dsh-cli-store/0.2.0 (https://github.com/Harzva/dsh-cli-store)' } })
  return (Array.isArray(body.crates) ? body.crates : []).map((crate) => candidate({
    source: 'crates',
    sourceId: crate.id ?? crate.name,
    name: crate.name ?? crate.id,
    description: crate.description,
    url: crate.repository ?? crate.homepage ?? `https://crates.io/crates/${encodeURIComponent(crate.id ?? crate.name ?? '')}`,
    homepage: crate.homepage ?? `https://crates.io/crates/${encodeURIComponent(crate.id ?? crate.name ?? '')}`,
    version: crate.max_version,
    tags: crate.categories ?? [],
    trust: 'unreviewed',
    installPlan: {
      manager: 'cargo',
      command: 'cargo',
      args: ['install', crate.id ?? crate.name],
      platforms: ['darwin', 'linux', 'win32'],
      requiresReview: true,
    },
    metadata: {
      downloads: Number.isFinite(crate.downloads) ? crate.downloads : 0,
      recentDownloads: Number.isFinite(crate.recent_downloads) ? crate.recent_downloads : 0,
    },
  })).filter((item) => item.sourceId)
}

const adapters = { npm: discoverNpm, github: discoverGithub, homebrew: discoverHomebrew, crates: discoverCrates }

function normalizeSources(sources) {
  const requested = sources === undefined || sources === 'all' ? DISCOVERY_SOURCES : (Array.isArray(sources) ? sources : [sources])
  const unique = Array.from(new Set(requested))
  const invalid = unique.filter((source) => !DISCOVERY_SOURCES.includes(source))
  if (invalid.length > 0) throw new Error(`dsh-cli-store: unknown discovery source: ${invalid.join(', ')}`)
  return unique
}

function dedupeCandidates(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    const key = entry.url ?? entry.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function discoverExternalClis(query, { sources = 'all', limit, request = fetchJson } = {}) {
  const normalizedQuery = normalizeQuery(query)
  if (normalizedQuery.length < 2) throw new Error('dsh-cli-store: discovery query must contain at least 2 characters')
  const selectedSources = normalizeSources(sources)
  const perSourceLimit = clampLimit(limit)
  const settled = await Promise.allSettled(selectedSources.map(async (source) => ({
    source,
    results: await adapters[source](normalizedQuery, { limit: perSourceLimit, request }),
  })))
  const results = []
  const errors = []
  for (const [index, item] of settled.entries()) {
    if (item.status === 'fulfilled') results.push(...item.value.results)
    else errors.push({ source: selectedSources[index] ?? 'unknown', error: item.reason?.message ?? String(item.reason) })
  }
  return {
    query: normalizedQuery,
    sources: selectedSources,
    fetchedAt: new Date().toISOString(),
    results: dedupeCandidates(results).slice(0, perSourceLimit * selectedSources.length),
    errors,
  }
}
