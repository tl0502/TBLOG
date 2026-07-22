#!/usr/bin/env node
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseJsonc } from './parse-jsonc.mjs'

const root = resolve(import.meta.dirname, '..')
const wrangler = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const sourceConfigPath = resolve(root, 'wrangler.local.jsonc')
const typesDirectory = resolve(root, '.wrangler', 'types')
const typesConfigPath = resolve(typesDirectory, 'wrangler.jsonc')
const typesConfig = parseJsonc(readFileSync(sourceConfigPath, 'utf8'))

// Module declarations depend on whether .output exists. Generate only stable binding types so a
// clean checkout and a post-build checkout produce the same committed declaration file.
delete typesConfig.main
delete typesConfig.assets
mkdirSync(typesDirectory, { recursive: true })
writeFileSync(typesConfigPath, `${JSON.stringify(typesConfig, null, 2)}\n`)

const args = [
  wrangler,
  'types',
  'types/cloudflare-bindings.d.ts',
  '--config',
  '.wrangler/types/wrangler.jsonc',
  '--env-interface',
  'CloudflareBindings',
  '--include-runtime',
  'false',
  '--strict-vars',
  'false',
  '--env-file',
  'wrangler.types.env'
]

if (process.argv.slice(2).includes('--check')) args.push('--check')

const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
