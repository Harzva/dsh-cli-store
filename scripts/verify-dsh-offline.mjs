import { mkdir, mkdtemp, readdir, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = resolve(root, 'artifacts')
await mkdir(artifacts, { recursive: true })
for (const name of await readdir(artifacts)) {
  if (name.endsWith('.tgz')) await unlink(resolve(artifacts, name))
}
const pack = spawnSync('pnpm', ['pack', '--pack-destination', artifacts], {
  cwd: root,
  encoding: 'utf8',
})
if (pack.status !== 0) {
  process.stdout.write(pack.stdout ?? '')
  process.stderr.write(pack.stderr ?? '')
  process.exit(pack.status ?? 1)
}

const tarballs = (await readdir(artifacts)).filter((name) => name.startsWith('dsh-cli-store-') && name.endsWith('.tgz'))
if (tarballs.length !== 1) throw new Error(`expected exactly one fresh dsh-cli-store tarball, found ${tarballs.length}`)
const tarball = resolve(artifacts, tarballs[0])
const dshHome = await mkdtemp(join(tmpdir(), 'dsh-cli-store-dsh-home-'))
const env = { ...process.env, DSH_HOME: dshHome }

try {
  const add = spawnSync('dsh', ['plugin', '--profile', 'tui', 'add', tarball], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  if (add.status !== 0) {
    process.stdout.write(add.stdout ?? '')
    process.stderr.write(add.stderr ?? '')
    throw new Error(`dsh plugin add failed with exit code ${add.status}`)
  }

  const dump = spawnSync('dsh', ['--profile', 'tui', '--dump-config'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  if (dump.status !== 0) {
    process.stdout.write(dump.stdout ?? '')
    process.stderr.write(dump.stderr ?? '')
    throw new Error(`dsh dump-config failed with exit code ${dump.status}`)
  }
  if (!dump.stdout.includes('dsh-cli-store')) throw new Error('dsh dump-config did not contain dsh-cli-store')
  console.log(`DSH offline verification passed: ${tarballs[0]}`)
} finally {
  await rm(dshHome, { recursive: true, force: true })
}
