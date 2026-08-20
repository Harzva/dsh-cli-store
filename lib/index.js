// dsh-cli-store — an external CLI registry and guarded installer for DSH.
//
// The store is deliberately different from a DSH plugin marketplace: its
// records describe binaries that run outside the Harness. Search and doctor
// are read-only; installation is allowlisted, shell-free, and confirmation
// gated.

import { formatDiscovery, formatDoctor, formatInstall, formatSavedDiscoveries, formatSearch } from './format.js'
import { discoverExternalClis } from './discovery.js'
import { loadDiscoveries, saveDiscoveries, searchDiscoveries } from './discovery-store.js'
import { doctorCli, installCli, installDiscoveredCli } from './installer.js'
import { publicEntry, searchRegistry } from './registry.js'

export const name = 'dsh-cli-store'
export const inject = ['tools']

const entrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    command: { type: 'string' },
    description: {
      type: 'object',
      additionalProperties: false,
      properties: { en: { type: 'string' }, zh: { type: 'string' } },
    },
    homepage: { type: 'string' },
    license: { type: 'string' },
    platforms: { type: 'array', items: { type: 'string' } },
    capabilities: { type: 'array', items: { type: 'string' } },
    installers: { type: 'array', items: { type: 'object' } },
  },
}

const discoveryEntrySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    source: { type: 'string' },
    sourceId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    url: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    homepage: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    version: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    trust: { type: 'string' },
    status: { type: 'string' },
  },
}

function textBlock(text) {
  return [{ type: 'text', text }]
}

function commonOutputSchema(data) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      markdown: { type: 'string' },
      data,
    },
  }
}

async function catalogResult(query = '') {
  const platform = process.platform
  const entries = await searchRegistry(query, { platform })
  return {
    platform,
    query,
    entries,
    markdown: formatSearch(entries, query, platform),
    data: entries.map((entry) => publicEntry(entry, platform)),
  }
}

function searchTool() {
  return {
    name: 'dsh_cli_search',
    description: '在 dsh-cli-store 中搜索当前平台可用的外部 CLI。它只读取插件内置清单，不执行命令。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string', description: 'CLI 名称、能力或关键词；留空列出全部。' } },
      required: [],
    },
    output: {
      schema: commonOutputSchema({ type: 'array', items: entrySchema }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: 'CLI Store 搜索', kind: 'read', rawInput: args ?? {} }),
    async execute(args) {
      const query = typeof args?.query === 'string' ? args.query : ''
      const result = await catalogResult(query)
      return { markdown: result.markdown, data: result.data }
    },
  }
}

function listTool() {
  return {
    name: 'dsh_cli_list',
    description: '列出 dsh-cli-store 中当前平台可用的全部外部 CLI；只读取插件内置清单，不执行命令。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
    output: {
      schema: commonOutputSchema({ type: 'array', items: entrySchema }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => true,
    presentCall: () => ({ card: 'generic', title: 'CLI Store 清单', kind: 'read', rawInput: {} }),
    async execute() {
      const result = await catalogResult()
      return { markdown: result.markdown, data: result.data }
    },
  }
}

function discoveryTool() {
  return {
    name: 'dsh_cli_discover',
    description: '搜索公开 CLI 来源（npm、GitHub、Homebrew、crates.io）。结果带来源和信任级别，默认只读；save=true 才会写入本地发现目录，发现结果不会自动变成可执行安装项。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '至少两个字符的 CLI 名称或能力关键词。' },
        sources: { type: 'array', items: { type: 'string', enum: ['npm', 'github', 'homebrew', 'crates'] }, description: '来源列表；不传则搜索全部来源。' },
        limit: { type: 'integer', minimum: 1, maximum: 25, description: '每个来源最多返回多少条。' },
        save: { type: 'boolean', description: '显式保存发现结果到本地目录；默认 false。' },
      },
      required: ['query'],
    },
    output: {
      schema: commonOutputSchema({
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          results: { type: 'array', items: discoveryEntrySchema },
          errors: { type: 'array', items: { type: 'object' } },
          saved: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }] },
        },
      }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => false,
    presentCall: (args) => ({
      card: 'generic',
      title: '全网 CLI 发现',
      kind: args?.save === true ? 'write' : 'read',
      rawInput: args ?? {},
    }),
    async execute(args) {
      const result = await discoverExternalClis(args?.query, {
        sources: args?.sources,
        limit: args?.limit,
      })
      const saved = args?.save === true ? await saveDiscoveries(result.results) : null
      return {
        markdown: formatDiscovery(result, saved),
        data: { ...result, saved: saved ? { added: saved.added, updated: saved.updated, total: saved.total } : null },
      }
    },
  }
}

function savedDiscoveriesTool() {
  return {
    name: 'dsh_cli_saved',
    description: '读取本地保存的 CLI 发现结果；不会联网，也不会执行安装命令。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '可选关键词。' },
        source: { type: 'string', description: '可选来源过滤，例如 github 或 npm。' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: '最多返回多少条。' },
      },
      required: [],
    },
    output: {
      schema: commonOutputSchema({ type: 'array', items: discoveryEntrySchema }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: '已保存的 CLI 发现', kind: 'read', rawInput: args ?? {} }),
    async execute(args) {
      const entries = await searchDiscoveries(args?.query ?? '', { source: args?.source, limit: args?.limit })
      return { markdown: formatSavedDiscoveries(entries, args?.query ?? ''), data: entries }
    },
  }
}

function installDiscoveredTool() {
  return {
    name: 'dsh_cli_install_discovered',
    description: '安装已保存的来源发现项。只有 source-verified 且带有受限安装计划的项目可以继续；npm、GitHub 和 crates.io 发现默认只返回 review-required。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: '保存发现项的 id，例如 homebrew:ffmpeg。' },
        confirm: { type: 'boolean', description: '确认执行安装写操作。' },
        dryRun: { type: 'boolean', description: '默认 true；设为 false 才会执行。' },
      },
      required: ['id'],
    },
    output: {
      schema: commonOutputSchema({ type: 'object', additionalProperties: true }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => false,
    presentCall: (args) => ({
      card: 'generic',
      title: '安装已发现 CLI',
      kind: args?.confirm === true && args?.dryRun === false ? 'write' : 'read',
      rawInput: args ?? {},
    }),
    async execute(args) {
      const result = await installDiscoveredCli(args?.id, {
        confirm: args?.confirm === true,
        dryRun: args?.dryRun !== false,
      })
      return { markdown: formatInstall(result), data: result }
    },
  }
}

function doctorTool() {
  return {
    name: 'dsh_cli_doctor',
    description: '检查一个外部 CLI 是否已安装，并读取其版本响应；只执行该 CLI 的版本参数。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'string', description: 'dsh-cli-store 中的 CLI id，例如 gh。' } },
      required: ['id'],
    },
    output: {
      schema: commonOutputSchema({ type: 'object', additionalProperties: true }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: 'CLI Store Doctor', kind: 'read', rawInput: args ?? {} }),
    async execute(args) {
      const result = await doctorCli(args?.id)
      return { markdown: formatDoctor(result), data: result }
    },
  }
}

function installTool() {
  return {
    name: 'dsh_cli_install',
    description: '按内置清单为外部 CLI 生成或执行安装计划。默认只预览；实际安装必须显式传 confirm=true 且 dryRun=false。不会执行 shell 字符串。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'dsh-cli-store 中的 CLI id，例如 gh。' },
        manager: { type: 'string', description: '可选安装器，例如 brew 或 winget。' },
        confirm: { type: 'boolean', description: '确认执行写操作；不传或为 false 时仅返回确认提示。' },
        dryRun: { type: 'boolean', description: '默认 true；设为 false 才会执行已确认的安装命令。' },
      },
      required: ['id'],
    },
    output: {
      schema: commonOutputSchema({ type: 'object', additionalProperties: true }),
      render: (_args, value) => textBlock(value.markdown),
    },
    isConcurrencySafe: () => false,
    presentCall: (args) => ({
      card: 'generic',
      title: 'CLI Store 安装',
      kind: args?.confirm === true && args?.dryRun === false ? 'write' : 'read',
      rawInput: args ?? {},
    }),
    async execute(args) {
      const result = await installCli(args?.id, {
        manager: typeof args?.manager === 'string' ? args.manager : undefined,
        confirm: args?.confirm === true,
        dryRun: args?.dryRun !== false,
      })
      return { markdown: formatInstall(result), data: result }
    },
  }
}

export function apply(ctx) {
  const register = ctx?.tools?.register
  if (typeof register !== 'function') throw new Error('dsh-cli-store: tools.register is unavailable')
  for (const tool of [searchTool(), listTool(), discoveryTool(), savedDiscoveriesTool(), installDiscoveredTool(), doctorTool(), installTool()]) register(tool)
}
