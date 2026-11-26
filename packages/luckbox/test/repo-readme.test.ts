// GitHub shows the repo's root README; it must stay a copy of the package README.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('the root README contains the package README unchanged', () => {
  const root = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')
  const pkg = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  expect(root.endsWith(pkg)).toBe(true)
})
