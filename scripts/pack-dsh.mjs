import { readdir, mkdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = resolve(root, 'artifacts')
await mkdir(artifacts, { recursive: true })
for (const name of await readdir(artifacts)) {
  if (name.endsWith('.tgz')) await unlink(resolve(artifacts, name))
}

const result = spawnSync('pnpm', ['pack', '--pack-destination', artifacts], {
  cwd: root,
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)
