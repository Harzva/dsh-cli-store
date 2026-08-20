import { publicEntry } from './registry.js'

export function formatEntry(entry, platform = process.platform) {
  const view = publicEntry(entry, platform)
  const capabilities = view.capabilities.length > 0 ? view.capabilities.join(', ') : 'not specified'
  const installers = view.installers.length > 0
    ? view.installers.map((item) => `${item.id} (${item.manager})`).join(', ')
    : 'none'
  return [
    `### ${view.name} (${view.id})`,
    view.description?.en ?? '',
    `Command: \`${view.command}\``,
    `Capabilities: ${capabilities}`,
    `Installers on ${platform}: ${installers}`,
    `Homepage: ${view.homepage}`,
  ].join('\n')
}

export function formatSearch(entries, query, platform = process.platform) {
  if (entries.length === 0) return `No CLI entries matched ${query ? `\`${query}\`` : 'the current platform'}.`
  return [
    `# dsh-cli-store${query ? `: ${query}` : ''}`,
    '',
    ...entries.map((entry) => formatEntry(entry, platform)),
  ].join('\n\n')
}

export function formatDoctor(result) {
  const icon = result.status === 'installed' ? '✅' : result.status === 'unsupported' ? '⚪' : '❌'
  return [
    `# ${icon} ${result.name}`,
    `Status: ${result.status}`,
    `Platform: ${result.platform}`,
    result.version ? `Version: ${result.version}` : `Detail: ${result.detail}`,
  ].join('\n')
}

export function formatInstall(result) {
  const lines = [
    `# ${result.name}`,
    `Status: ${result.status}`,
  ]
  if (result.displayCommand) lines.push(`Command: \`${result.displayCommand}\``)
  else if (result.status === 'review-required') lines.push('Command: unavailable until review.')
  if (result.status === 'confirmation-required') {
    lines.push('', 'This is a write operation. Re-run with confirm=true after reviewing the command.')
  }
  if (result.status === 'review-required') {
    lines.push('', result.reason)
  }
  if (result.verification) {
    lines.push(`Verification: ${result.verification.status}${result.verification.version ? ` (${result.verification.version})` : ''}`)
  }
  if (result.result?.stdout) lines.push('', '```', result.result.stdout.trim(), '```')
  if (result.result?.stderr) lines.push('', '```text', result.result.stderr.trim(), '```')
  return lines.join('\n')
}

function externalText(value, maxLength = 500) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[\r\n]+/g, ' ').replace(/[`<>]/g, '').slice(0, maxLength)
}

function formatDiscoveryEntry(entry) {
  const trust = entry.trust === 'source-verified' ? 'source metadata verified; install still requires review' : 'unreviewed external metadata'
  const lines = [
    `### ${externalText(entry.name)} [${externalText(entry.source, 40)}]`,
    `> External metadata (untrusted): ${externalText(entry.description)}`,
    `Source: ${externalText(entry.url ?? entry.homepage)}`,
    `Trust: ${trust}`,
  ]
  if (entry.version) lines.push(`Version: ${externalText(entry.version, 80)}`)
  if (entry.installPlan) {
    lines.push(`Suggested plan (not auto-executable): \`${entry.installPlan.command} ${entry.installPlan.args.map((arg) => externalText(arg, 120)).join(' ')}\``)
  }
  return lines.join('\n')
}

export function formatDiscovery(result, saved = null) {
  const header = `# CLI discovery: ${externalText(result.query, 120)}`
  const summary = `Sources: ${result.sources.join(', ')} · Results: ${result.results.length}${result.errors.length > 0 ? ` · Source errors: ${result.errors.length}` : ''}${saved ? ` · Saved new: ${saved.added}` : ''}`
  const errors = result.errors.length > 0
    ? ['', '## Source errors', ...result.errors.map((item) => `- ${externalText(item.source, 40)}: ${externalText(item.error, 240)}`)]
    : []
  return [header, summary, '', ...result.results.map(formatDiscoveryEntry), ...errors].join('\n\n')
}

export function formatSavedDiscoveries(entries, query = '') {
  if (entries.length === 0) return `No saved discoveries matched${query ? ` \`${externalText(query, 120)}\`` : ''}.`
  return [
    `# Saved CLI discoveries${query ? `: ${externalText(query, 120)}` : ''}`,
    '',
    ...entries.map(formatDiscoveryEntry),
  ].join('\n\n')
}
