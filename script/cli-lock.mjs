// Writes cli.lock, the Deno lockfile for DEFAULT_CLI_VERSION, from scratch.
// Run it with `npm run cli-lock` after a change to DEFAULT_CLI_VERSION. It
// needs a `deno` on PATH of the version in src/install.ts (DENO_VERSION).
// Node strips the types of src/args.ts when it imports it.

import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import {
  cacheArgs,
  CLI_LOCK_PATH,
  cliSpecifier,
  DEFAULT_CLI_VERSION
} from '../src/args.ts'

const { specifier } = cliSpecifier(DEFAULT_CLI_VERSION, {})

rmSync(CLI_LOCK_PATH, { force: true })
execFileSync('deno', cacheArgs(specifier, [`--lock=${CLI_LOCK_PATH}`]), {
  stdio: 'inherit'
})
console.log(`Wrote ${CLI_LOCK_PATH} for ${specifier}.`)
