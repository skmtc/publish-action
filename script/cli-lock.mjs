// Writes cli.lock, the Deno lockfile for DEFAULT_CLI_VERSION, from scratch.
// Run it with `npm run cli-lock` after a change to DEFAULT_CLI_VERSION. It
// needs a `deno` on PATH of the version in src/args.ts (DENO_VERSION), and
// exits when the PATH deno has another version.
// Node strips the types of src/args.ts when it imports it.

import { execFileSync } from 'node:child_process'
import { renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  cacheArgs,
  CLI_LOCK_PATH,
  cliSpecifier,
  DENO_VERSION,
  DEFAULT_CLI_VERSION
} from '../src/args.ts'

/**
 * Writes the lockfile for `specifier` to `lockPath`. `deno cache` writes a
 * temporary file next to it, which replaces `lockPath` only when the command
 * succeeds, so a failed fetch leaves an existing lockfile as it was.
 *
 * @param {object} options
 * @param {(args: string[]) => string} options.deno Runs deno with the
 *   arguments and returns its stdout. Throws when deno fails.
 * @param {string} options.lockPath The lockfile to write.
 * @param {string} options.specifier The module specifier to lock.
 * @throws When `deno --version` is not {@link DENO_VERSION}, or `deno cache`
 *   fails.
 */
export function writeCliLock({ deno, lockPath, specifier }) {
  const version = /^deno (\S+)/.exec(deno(['--version']))?.[1]

  if (version !== DENO_VERSION) {
    throw new Error(
      `deno on PATH is ${version ?? 'of an unknown version'}, not ${DENO_VERSION}. Install Deno ${DENO_VERSION} to write ${lockPath}.`
    )
  }

  const tempPath = `${lockPath}.tmp`

  rmSync(tempPath, { force: true })

  try {
    deno(cacheArgs(specifier, [`--lock=${tempPath}`]))
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }

  renameSync(tempPath, lockPath)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { specifier } = cliSpecifier(DEFAULT_CLI_VERSION, {})

  try {
    writeCliLock({
      deno: (args) =>
        execFileSync('deno', args, {
          encoding: 'utf8',
          stdio: ['inherit', 'pipe', 'inherit']
        }),
      lockPath: CLI_LOCK_PATH,
      specifier
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }

  console.log(`Wrote ${CLI_LOCK_PATH} for ${specifier}.`)
}
