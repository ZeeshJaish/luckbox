// Writes the Node results that the browser page compares against.
// Run after a build: npm run test:browser:prepare
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { luck } = require('../../dist/index.cjs')

// fingerprint.js is a plain browser script, so run it the way a page would.
const page = {}
runInNewContext(readFileSync(join(__dirname, 'fingerprint.js'), 'utf8'), page)
const result = JSON.parse(JSON.stringify(page.fingerprint(luck)))
writeFileSync(join(__dirname, 'expected.json'), JSON.stringify(result, null, 1) + '\n')
console.log('wrote test/browser/expected.json')
