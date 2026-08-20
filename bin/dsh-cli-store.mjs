#!/usr/bin/env node

import { formatDiscovery, formatDoctor, formatInstall, formatSavedDiscoveries, formatSearch } from '../lib/format.js'
import { discoverExternalClis } from '../lib/discovery.js'
import { saveDiscoveries, searchDiscoveries } from '../lib/discovery-store.js'
import { doctorCli, installCli, installDiscoveredCli } from '../lib/installer.js'
import { publicEntry, searchRegistry } from '../lib/registry.js'

function help() {
  console.log(`dsh-cli-store — registry and guarded installer for external CLIs

Usage:
  dsh-cli-store search [query]
  dsh-cli-store list [--json]
  dsh-cli-store discover <query> [--source <source>] [--limit <n>] [--save] [--json]
  dsh-cli-store saved [query] [--source <source>] [--json]
  dsh-cli-store install-discovered <id> --confirm [--no-dry-run] [--json]
  dsh-cli-store doctor <id> [--json]
  dsh-cli-store plan install <id> [--manager <manager>] [--json]
  dsh-cli-store install <id> --confirm [--manager <manager>] [--no-dry-run] [--json]

Install is preview-only unless both --confirm and --no-dry-run are supplied.
`)
}

function option(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function positionals(args, valueOptions = []) {
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (valueOptions.includes(arg)) {
      index += 1
      continue
    }
    if (!arg.startsWith('--')) result.push(arg)
  }
  return result
}

function emit(value, formatter, json) {
  console.log(json ? JSON.stringify(value, null, 2) : formatter(value))
}

const [command, ...args] = process.argv.slice(2)
try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    help()
  } else if (command === 'search' || command === 'list') {
    const query = command === 'search' ? args.filter((arg) => !arg.startsWith('--')).join(' ') : ''
    const entries = await searchRegistry(query)
    const data = entries.map((entry) => publicEntry(entry))
    emit(command === 'search' ? { query, data } : { data }, (value) => formatSearch(entries, query), args.includes('--json'))
  } else if (command === 'discover') {
    const query = positionals(args, ['--source', '--limit']).join(' ')
    const result = await discoverExternalClis(query, {
      sources: option(args, '--source') ?? 'all',
      limit: option(args, '--limit'),
    })
    const saved = args.includes('--save') ? await saveDiscoveries(result.results) : null
    emit({ ...result, saved: saved ? { added: saved.added, updated: saved.updated, total: saved.total } : null }, () => formatDiscovery(result, saved), args.includes('--json'))
  } else if (command === 'saved') {
    const query = positionals(args, ['--source']).join(' ')
    const entries = await searchDiscoveries(query, { source: option(args, '--source') })
    emit({ query, data: entries }, () => formatSavedDiscoveries(entries, query), args.includes('--json'))
  } else if (command === 'install-discovered') {
    if (!args[0]) throw new Error('install-discovered requires a saved discovery id')
    const result = await installDiscoveredCli(args[0], {
      confirm: args.includes('--confirm'),
      dryRun: !args.includes('--no-dry-run'),
    })
    emit(result, formatInstall, args.includes('--json'))
  } else if (command === 'doctor') {
    if (!args[0]) throw new Error('doctor requires a CLI id')
    const result = await doctorCli(args[0])
    emit(result, formatDoctor, args.includes('--json'))
  } else if (command === 'plan' && args[0] === 'install') {
    if (!args[1]) throw new Error('plan install requires a CLI id')
    const result = await installCli(args[1], { manager: option(args, '--manager') })
    emit(result, formatInstall, args.includes('--json'))
  } else if (command === 'install') {
    if (!args[0]) throw new Error('install requires a CLI id')
    const result = await installCli(args[0], {
      manager: option(args, '--manager'),
      confirm: args.includes('--confirm'),
      dryRun: !args.includes('--no-dry-run'),
    })
    emit(result, formatInstall, args.includes('--json'))
  } else {
    help()
    process.exitCode = 1
  }
} catch (error) {
  console.error(`dsh-cli-store: ${error.message}`)
  process.exitCode = 1
}
