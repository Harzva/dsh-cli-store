import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverExternalClis } from '../lib/discovery.js'

function fakeRequest(url) {
  const parsed = new URL(url)
  if (parsed.hostname === 'registry.npmjs.org') {
    return Promise.resolve({ objects: [{ package: {
      name: 'image-cli',
      description: 'An image command line tool.',
      version: '1.2.3',
      keywords: ['image', 'cli'],
      links: { npm: 'https://www.npmjs.com/package/image-cli', homepage: 'https://example.com/image-cli' },
    } }] })
  }
  if (parsed.hostname === 'api.github.com') {
    return Promise.resolve({ items: [{
      full_name: 'example/image-cli',
      html_url: 'https://github.com/example/image-cli',
      description: 'Image processing CLI.',
      topics: ['cli', 'image'],
      stargazers_count: 42,
      forks_count: 3,
      archived: false,
    }] })
  }
  if (parsed.hostname === 'formulae.brew.sh') {
    return Promise.resolve([{ name: 'image-cli', desc: 'Image tools', homepage: 'https://example.com/homebrew-image-cli', license: 'MIT', executables: ['image-cli'], versions: { stable: '2.0.0' } }])
  }
  if (parsed.hostname === 'crates.io') {
    return Promise.resolve({ crates: [{ id: 'image-cli', name: 'image-cli', description: 'Rust image CLI', max_version: '0.4.0', repository: 'https://github.com/example/image-cli-rs', categories: ['command-line-utilities'], downloads: 1000, recent_downloads: 20 }] })
  }
  throw new Error(`unexpected URL: ${url}`)
}

test('discovery adapters normalize npm, GitHub, Homebrew, and crates.io results', async () => {
  const result = await discoverExternalClis('image cli', { limit: 3, request: fakeRequest })
  assert.equal(result.errors.length, 0)
  assert.equal(result.results.length, 4)
  assert.equal(result.results.find((entry) => entry.source === 'npm').trust, 'unreviewed')
  const homebrew = result.results.find((entry) => entry.source === 'homebrew')
  assert.equal(homebrew.trust, 'source-verified')
  assert.deepEqual(homebrew.installPlan.args, ['install', 'image-cli'])
  assert.equal(result.results.find((entry) => entry.source === 'crates').metadata.downloads, 1000)
})

test('one source failure is isolated and attributed to the correct source', async () => {
  const request = async (url, options) => {
    if (new URL(url).hostname === 'api.github.com') throw new Error('rate limited')
    return fakeRequest(url, options)
  }
  const result = await discoverExternalClis('image', { sources: ['npm', 'github'], request })
  assert.equal(result.results.length, 1)
  assert.deepEqual(result.errors, [{ source: 'github', error: 'rate limited' }])
})

test('discovery rejects too-short queries and unknown sources', async () => {
  await assert.rejects(() => discoverExternalClis('x', { request: fakeRequest }), /at least 2 characters/)
  await assert.rejects(() => discoverExternalClis('image', { sources: ['unknown'], request: fakeRequest }), /unknown discovery source/)
})
