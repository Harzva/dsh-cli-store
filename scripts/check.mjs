import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const failures = []

if (manifest.name !== 'dsh-cli-store') failures.push('package name must be dsh-cli-store')
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') failures.push('dsh.bundle.patch must point to ./cordis.patch.yml')
if (!manifest.repository?.url?.includes('github.com/Harzva/dsh-cli-store')) failures.push('repository URL must point to Harzva/dsh-cli-store')

const checkFiles = [
  'bin/dsh-cli-store.mjs',
  'lib/format.js',
  'lib/index.js',
  'lib/installer.js',
  'lib/registry.js',
  'lib/runner.js',
  'scripts/pack-dsh.mjs',
  'scripts/verify-dsh-offline.mjs',
]
for (const file of checkFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (result.status !== 0) failures.push(`${file}: ${result.stderr.trim()}`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  process.exit(1)
}

const tests = spawnSync(process.execPath, ['--test'], { cwd: root, stdio: 'inherit' })
if (tests.status !== 0) process.exit(tests.status ?? 1)
console.log('dsh-cli-store check passed')
