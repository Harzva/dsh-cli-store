// dsh-cli-store — an external CLI registry and guarded installer for DSH.
//
// The store is deliberately different from a DSH plugin marketplace: its
// records describe binaries that run outside the Harness. Search and doctor
// are read-only; installation is allowlisted, shell-free, and confirmation
// gated.

import { formatDoctor, formatInstall, formatSearch } from './format.js'
import { doctorCli, installCli } from './installer.js'
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
      const platform = process.platform
      const query = typeof args?.query === 'string' ? args.query : ''
      const entries = await searchRegistry(query, { platform })
      return {
        markdown: formatSearch(entries, query, platform),
        data: entries.map((entry) => publicEntry(entry, platform)),
      }
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
  for (const tool of [searchTool(), doctorTool(), installTool()]) register(tool)
}
