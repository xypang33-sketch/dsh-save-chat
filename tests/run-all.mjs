/**
 * Test runner: executes every test file in this directory and reports a summary.
 *
 * Each test is a plain Node script that asserts with console output and exits
 * non-zero on failure; its output is shown only when it fails, so a green run
 * stays readable while a red one keeps the evidence.
 *
 * @module dsh-save-chat/tests/run-all
 */

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const skipped = new Set(['support.mjs', 'run-all.mjs'])
const files = readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && !skipped.has(name))
  .sort()

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('close', (code) => resolve({ file, code, output }))
  })
}

const failures = []
for (const file of files) {
  const result = await run(file)
  if (result.code === 0) {
    console.log(`✓ ${file}`)
    continue
  }
  failures.push(result)
  console.log(`✗ ${file} (exit ${result.code})`)
  console.log(result.output.split('\n').slice(-40).map((line) => `    ${line}`).join('\n'))
}

console.log(`\n${files.length - failures.length}/${files.length} passed`)
if (failures.length > 0) {
  console.log('failed:', failures.map((failure) => failure.file).join(', '))
  process.exit(1)
}
