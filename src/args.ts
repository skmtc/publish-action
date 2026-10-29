import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '@actions/core'

/** The `@skmtc/cli` version the action installs when `cli-version` is empty. */
export const DEFAULT_CLI_VERSION = '0.9.60'

/**
 * The Deno lockfile for {@link DEFAULT_CLI_VERSION}, at the root of the action.
 * `src/` and `dist/` both sit one level below it, so the path does not depend
 * on the working directory (the user's checkout). `npm run cli-lock` writes it.
 */
export const CLI_LOCK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'cli.lock'
)

/**
 * Undocumented test hook: a module specifier that replaces
 * `jsr:@skmtc/cli@<version>`. When it is set, the action skips `deno cache`.
 */
export const CLI_SPECIFIER_ENV = 'SKMTC_PUBLISH_ACTION_CLI_SPECIFIER'

/** The hub hosts the CLI talks to. The CLI fixes them; the action allows them. */
const HUB_HOSTS = ['api.skmtc.dev', 'api.skmtc.net', 'api.skmtc.co.uk']

/** The environment variables the CLI reads. */
const CLI_ENV_VARS = ['SKMTC_HUB_TOKEN', 'SKMTC_ENV', 'SKMTC_API_ORIGIN']

const CLI_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

/** The deno flags every call shares. */
const DENO_FLAGS = ['--no-config', '--minimum-dependency-age=0']

export type Inputs = {
  file: string
  api: string
  visibility: string
  originUrl: string
  cliVersion: string
  env: string
}

/**
 * Reads every input except `token`. The CLI checks `api`, `visibility` and
 * `env`; the action checks only `cli-version`.
 */
export function readInputs(): Inputs {
  const cliVersion = core.getInput('cli-version') || DEFAULT_CLI_VERSION

  if (!CLI_VERSION_PATTERN.test(cliVersion)) {
    throw new Error(
      `cli-version "${cliVersion}" is not an exact version such as ${DEFAULT_CLI_VERSION}`
    )
  }

  return {
    file: core.getInput('file', { required: true }),
    api: core.getInput('api', { required: true }),
    visibility: core.getInput('visibility'),
    originUrl: core.getInput('origin-url'),
    cliVersion,
    env: core.getInput('env')
  }
}

/**
 * The module specifier of the CLI, or the test hook when it is set, and the
 * lock flags for it. Only {@link DEFAULT_CLI_VERSION} has a lockfile: a custom
 * `cli-version` and the test hook run unlocked.
 */
export function cliSpecifier(
  cliVersion: string,
  env: NodeJS.ProcessEnv
): { specifier: string; overridden: boolean; lockFlags: string[] } {
  const override = env[CLI_SPECIFIER_ENV]

  if (override) {
    return { specifier: override, overridden: true, lockFlags: [] }
  }

  return {
    specifier: `jsr:@skmtc/cli@${cliVersion}`,
    overridden: false,
    lockFlags:
      cliVersion === DEFAULT_CLI_VERSION
        ? [`--lock=${CLI_LOCK_PATH}`, '--frozen']
        : []
  }
}

/** The arguments of `deno cache` for the CLI. */
export function cacheArgs(specifier: string, lockFlags: string[]): string[] {
  return ['cache', ...DENO_FLAGS, ...lockFlags, specifier]
}

/**
 * The arguments of `deno run ... api publish`. The token is not one of them:
 * it reaches the CLI as `SKMTC_HUB_TOKEN` (see {@link childEnv}).
 */
export function publishArgs(
  inputs: Inputs,
  specifier: string,
  lockFlags: string[]
): string[] {
  return [
    'run',
    ...DENO_FLAGS,
    ...lockFlags,
    '--no-prompt',
    `--allow-env=${CLI_ENV_VARS.join(',')}`,
    `--allow-read=${inputs.file}`,
    `--allow-net=${HUB_HOSTS.join(',')}`,
    specifier,
    'api',
    'publish',
    inputs.file,
    '--api',
    inputs.api,
    '--json',
    ...(inputs.visibility ? ['--visibility', inputs.visibility] : []),
    ...(inputs.originUrl ? ['--origin-url', inputs.originUrl] : []),
    ...(inputs.env ? ['--env', inputs.env] : [])
  ]
}

/**
 * The environment of the CLI process. `@actions/exec` replaces the child's
 * environment with this object, so it carries the whole parent environment.
 * `NO_COLOR` keeps Deno's crash output, which reaches annotations, free of
 * escape codes.
 */
export function childEnv(
  env: NodeJS.ProcessEnv,
  token: string
): Record<string, string> {
  const defined = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )

  return {
    ...Object.fromEntries(defined),
    NO_COLOR: '1',
    SKMTC_HUB_TOKEN: token
  }
}
