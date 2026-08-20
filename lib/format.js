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
    `Command: \`${result.displayCommand}\``,
  ]
  if (result.status === 'confirmation-required') {
    lines.push('', 'This is a write operation. Re-run with confirm=true after reviewing the command.')
  }
  if (result.result?.stdout) lines.push('', '```', result.result.stdout.trim(), '```')
  if (result.result?.stderr) lines.push('', '```text', result.result.stderr.trim(), '```')
  return lines.join('\n')
}
