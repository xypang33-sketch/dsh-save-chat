/**
 * Shared module resolution for the test suite.
 *
 * The plugin itself has no runtime dependencies, so the tests find React, React
 * DOM, jsdom, Testing Library, and micromark wherever the developer keeps them:
 * first an explicit `DSH_TEST_MODULES`, then this package's own `node_modules`
 * (after `npm install`), then a DSH checkout's pnpm store for development
 * inside the harness repository.
 *
 * @module dsh-save-chat/tests/support
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  process.env.DSH_TEST_MODULES,
  path.join(here, '..', 'node_modules'),
  process.env.DSH_CHECKOUT === undefined ? undefined : path.join(process.env.DSH_CHECKOUT, 'node_modules', '.pnpm'),
  '/Users/xiangyingpang/Documents/DeepseekHarness/deepseek-harness/node_modules/.pnpm',
].filter((entry) => typeof entry === 'string' && existsSync(entry))

/**
 * Require one package from the first candidate that provides it.
 * @param specifier - module specifier, e.g. `react` or `react-dom/server`.
 * @returns the imported module.
 */
export function loadModule(specifier) {
  for (const base of candidates) {
    try {
      return createRequire(path.join(base, 'anchor.js'))(specifier)
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`cannot resolve "${specifier}" — run npm install in the package, or set DSH_TEST_MODULES`)
}

export const React = loadModule('react')
export const ReactDOMServer = loadModule('react-dom/server')
export const ReactDOMClient = loadModule('react-dom/client')
export const ReactDOM = ReactDOMClient
export const JSDOM = loadModule('jsdom').JSDOM
