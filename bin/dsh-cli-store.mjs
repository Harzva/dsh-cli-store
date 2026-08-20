#!/usr/bin/env node

import { formatDoctor, formatInstall, formatSearch } from '../lib/format.js'
import { doctorCli, installCli } from '../lib/installer.js'
import { searchRegistry } from '../lib/registry.js'

function help() {
  console.log(`dsh-cli-store — registry and guarded installer for external CLIs

Usage:
  dsh-cli-store search [query]
  dsh-cli-store list
  dsh-cli-store doctor <id>
  dsh-cli-store plan install <id> [--manager <manager>]
  dsh-cli-store install <id> --confirm [--manager <manager>] [--no-dry-run]

Install is preview-only unless both --confirm and --no-dry-run are supplied.
`)
}

function option(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const [command, ...args] = process.argv.slice(2)
try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    help()
  } else if (command === 'search' || command === 'list') {
    const query = command === 'search' ? (args[0] ?? '') : ''
    const entries = await searchRegistry(query)
    console.log(formatSearch(entries, query))
  } else if (command === 'doctor') {
    if (!args[0]) throw new Error('doctor requires a CLI id')
    console.log(formatDoctor(await doctorCli(args[0])))
  } else if (command === 'plan' && args[0] === 'install') {
    if (!args[1]) throw new Error('plan install requires a CLI id')
    const result = await installCli(args[1], { manager: option(args, '--manager') })
    console.log(formatInstall(result))
  } else if (command === 'install') {
    if (!args[0]) throw new Error('install requires a CLI id')
    const result = await installCli(args[0], {
      manager: option(args, '--manager'),
      confirm: args.includes('--confirm'),
      dryRun: !args.includes('--no-dry-run'),
    })
    console.log(formatInstall(result))
  } else {
    help()
    process.exitCode = 1
  }
} catch (error) {
  console.error(`dsh-cli-store: ${error.message}`)
  process.exitCode = 1
}
