import { loadModule } from './support.mjs'
import { readFileSync } from 'node:fs'
const { micromark } = loadModule('micromark')
const { gfm, gfmHtml } = loadModule('micromark-extension-gfm')
const file = process.argv[2]
const html = micromark(readFileSync(file, 'utf8'), { extensions: [gfm()], htmlExtensions: [gfmHtml()] })
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
console.log('visible plugin syntax:', /dsh-favorite|dsh-favorites/.test(text) ? 'FOUND (bad)' : 'none')
console.log('--- rendered headings ---')
for (const m of html.matchAll(/<h([1-6])>(.*?)<\/h\1>/g)) console.log('h' + m[1], m[2].replace(/<[^>]+>/g, ''))
