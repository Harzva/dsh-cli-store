import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('DSH apply registers the catalog, doctor, and installer tools', async () => {
  const tools = []
  apply({ tools: { register: (tool) => tools.push(tool) } })
  assert.deepEqual(tools.map((tool) => tool.name), [
    'dsh_cli_search',
    'dsh_cli_list',
    'dsh_cli_doctor',
    'dsh_cli_install',
  ])
  const searchResult = await tools[0].execute({ query: 'json' })
  assert.equal(searchResult.data[0].id, 'jq')
  assert.match(searchResult.markdown, /jq/i)
  const listResult = await tools[1].execute()
  assert.equal(listResult.data.length, 4)
})

test('DSH apply fails clearly when the tools service is missing', () => {
  assert.throws(() => apply({}), /tools\.register is unavailable/)
})
