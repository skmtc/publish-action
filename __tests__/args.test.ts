/**
 * Unit tests for the input mapping, src/args.ts
 */
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const {
  cacheArgs,
  childEnv,
  CLI_LOCK_PATH,
  cliSpecifier,
  DEFAULT_CLI_VERSION,
  publishArgs,
  readInputs
} = await import('../src/args.js')

const baseInputs = {
  file: 'openapi.yaml',
  api: '@acme/pets',
  visibility: '',
  originUrl: '',
  cliVersion: '0.10.3',
  env: ''
}

const LOCK_FLAGS = ['--lock=/action/cli.lock', '--frozen']

const TOKEN = 'skmtc_pat_secret'

/** What GitHub sets in a job with `id-token: write`. */
const OIDC_ENV = {
  GITHUB_ACTIONS: 'true',
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://run-actions-1-azure-eastus.actions.githubusercontent.com/42/idtoken/abc/def?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token'
}

function mockInputs(inputs: Record<string, string>): void {
  core.getInput.mockImplementation((name) => inputs[name] ?? '')
}

describe('args.ts', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('publishArgs', () => {
    it('builds the deno run command with only the required inputs', () => {
      expect(
        publishArgs(baseInputs, 'jsr:@skmtc/cli@0.10.3', [], TOKEN, {})
      ).toEqual([
        'run',
        '--no-config',
        '--minimum-dependency-age=0',
        '--no-prompt',
        '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN',
        '--allow-read=openapi.yaml',
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk',
        'jsr:@skmtc/cli@0.10.3',
        'api',
        'publish',
        'openapi.yaml',
        '--api',
        '@acme/pets',
        '--json'
      ])
    })

    it('passes no --origin-url when origin-url is empty', () => {
      const args = publishArgs(
        baseInputs,
        'jsr:@skmtc/cli@0.10.3',
        [],
        TOKEN,
        {}
      )

      expect(args).not.toContain('--origin-url')
    })

    it('puts the lock flags after the shared deno flags', () => {
      const args = publishArgs(
        baseInputs,
        'jsr:@skmtc/cli@0.10.3',
        LOCK_FLAGS,
        TOKEN,
        {}
      )

      expect(args.slice(0, 6)).toEqual([
        'run',
        '--no-config',
        '--minimum-dependency-age=0',
        ...LOCK_FLAGS,
        '--no-prompt'
      ])
    })

    it('appends the optional flags when their inputs are set', () => {
      const args = publishArgs(
        {
          ...baseInputs,
          visibility: 'private',
          originUrl: 'https://github.com/acme/pets/blob/main/openapi.yaml',
          env: 'staging'
        },
        'jsr:@skmtc/cli@0.10.3',
        [],
        TOKEN,
        {}
      )

      expect(args.slice(-6)).toEqual([
        '--visibility',
        'private',
        '--origin-url',
        'https://github.com/acme/pets/blob/main/openapi.yaml',
        '--env',
        'staging'
      ])
    })

    it.each([TOKEN, ''])('never passes --token (token %p)', (token) => {
      const args = publishArgs(baseInputs, 'x', [], token, OIDC_ENV)

      expect(args).not.toContain('--token')
      expect(args.join(' ')).not.toContain(TOKEN)
    })

    it('keeps the flags as they are with a token, even in an OIDC job', () => {
      const args = publishArgs(baseInputs, 'x', [], TOKEN, OIDC_ENV)

      expect(args).toContain(
        '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN'
      )
      expect(args).toContain(
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk'
      )
    })

    it('allows the OIDC variables and host without a token', () => {
      const args = publishArgs(baseInputs, 'x', [], '', OIDC_ENV)

      expect(args).toContain(
        '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN,GITHUB_ACTIONS,ACTIONS_ID_TOKEN_REQUEST_URL,ACTIONS_ID_TOKEN_REQUEST_TOKEN'
      )
      expect(args).toContain(
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk,run-actions-1-azure-eastus.actions.githubusercontent.com'
      )
    })

    it('keeps the port of the OIDC host', () => {
      const args = publishArgs(baseInputs, 'x', [], '', {
        ACTIONS_ID_TOKEN_REQUEST_URL: 'http://localhost:8080/idtoken'
      })

      expect(args).toContain(
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk,localhost:8080'
      )
    })

    it.each([undefined, '', 'not a url', 'file:///x', 'https://a,b.com/x'])(
      'adds no OIDC host when the request URL is %p',
      (requestUrl) => {
        const args = publishArgs(baseInputs, 'x', [], '', {
          ...OIDC_ENV,
          ACTIONS_ID_TOKEN_REQUEST_URL: requestUrl
        })

        expect(args).toContain(
          '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk'
        )
        expect(args).toContain(
          '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN,GITHUB_ACTIONS,ACTIONS_ID_TOKEN_REQUEST_URL,ACTIONS_ID_TOKEN_REQUEST_TOKEN'
        )
      }
    )
  })

  describe('cacheArgs', () => {
    it('caches the specifier without config and without the age gate', () => {
      expect(cacheArgs('jsr:@skmtc/cli@0.10.3', [])).toEqual([
        'cache',
        '--no-config',
        '--minimum-dependency-age=0',
        'jsr:@skmtc/cli@0.10.3'
      ])
    })

    it('puts the lock flags before the specifier', () => {
      expect(cacheArgs('jsr:@skmtc/cli@0.10.3', LOCK_FLAGS)).toEqual([
        'cache',
        '--no-config',
        '--minimum-dependency-age=0',
        ...LOCK_FLAGS,
        'jsr:@skmtc/cli@0.10.3'
      ])
    })
  })

  describe('cliSpecifier', () => {
    it('pins the jsr specifier to a custom version, unlocked', () => {
      expect(cliSpecifier('1.2.3', {})).toEqual({
        specifier: 'jsr:@skmtc/cli@1.2.3',
        overridden: false,
        lockFlags: []
      })
    })

    it('locks the default version with the action lockfile', () => {
      expect(cliSpecifier(DEFAULT_CLI_VERSION, {})).toEqual({
        specifier: `jsr:@skmtc/cli@${DEFAULT_CLI_VERSION}`,
        overridden: false,
        lockFlags: [`--lock=${CLI_LOCK_PATH}`, '--frozen']
      })
    })

    it('uses the test hook when it is set, unlocked', () => {
      expect(
        cliSpecifier(DEFAULT_CLI_VERSION, {
          SKMTC_PUBLISH_ACTION_CLI_SPECIFIER: './test/fake-cli.js'
        })
      ).toEqual({
        specifier: './test/fake-cli.js',
        overridden: true,
        lockFlags: []
      })
    })
  })

  describe('CLI_LOCK_PATH', () => {
    it('is cli.lock at the action root, not in the working directory', () => {
      expect(CLI_LOCK_PATH).toBe(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          'cli.lock'
        )
      )
    })
  })

  describe('childEnv', () => {
    it('keeps the parent environment and adds the token and NO_COLOR', () => {
      expect(
        childEnv({ PATH: '/usr/bin', HOME: '/home/runner' }, 'secret')
      ).toEqual({
        PATH: '/usr/bin',
        HOME: '/home/runner',
        NO_COLOR: '1',
        SKMTC_HUB_TOKEN: 'secret'
      })
    })

    it('replaces an inherited SKMTC_HUB_TOKEN with the input', () => {
      expect(childEnv({ SKMTC_HUB_TOKEN: 'old' }, 'new')).toEqual({
        NO_COLOR: '1',
        SKMTC_HUB_TOKEN: 'new'
      })
    })

    it('sets no SKMTC_HUB_TOKEN and drops an inherited one without a token', () => {
      expect(
        childEnv({ PATH: '/usr/bin', SKMTC_HUB_TOKEN: 'inherited' }, '')
      ).toEqual({
        PATH: '/usr/bin',
        NO_COLOR: '1'
      })
    })

    it('keeps the OIDC variables for the CLI', () => {
      expect(childEnv(OIDC_ENV, '')).toEqual({ ...OIDC_ENV, NO_COLOR: '1' })
    })

    it('drops undefined variables', () => {
      expect(childEnv({ UNSET: undefined }, 't')).toEqual({
        NO_COLOR: '1',
        SKMTC_HUB_TOKEN: 't'
      })
    })
  })

  describe('readInputs', () => {
    it('reads the inputs and defaults cli-version', () => {
      mockInputs({
        file: 'openapi.yaml',
        api: '@acme/pets',
        'origin-url': 'https://example.com/openapi.yaml'
      })

      expect(readInputs()).toEqual({
        ...baseInputs,
        originUrl: 'https://example.com/openapi.yaml',
        cliVersion: DEFAULT_CLI_VERSION
      })
    })

    it('marks file and api as required', () => {
      mockInputs({ file: 'openapi.yaml', api: '@acme/pets' })

      readInputs()

      expect(core.getInput).toHaveBeenCalledWith('file', { required: true })
      expect(core.getInput).toHaveBeenCalledWith('api', { required: true })
    })

    it.each(['latest', '^0.10.0', '0.9', '0.10.0-rc.1', ' 0.10.0'])(
      'rejects cli-version %p',
      (cliVersion) => {
        mockInputs({ file: 'f', api: 'a', 'cli-version': cliVersion })

        expect(() => readInputs()).toThrow(/is not an exact version/)
      }
    )

    it('accepts an exact cli-version', () => {
      mockInputs({ file: 'f', api: 'a', 'cli-version': '0.10.1' })

      expect(readInputs().cliVersion).toBe('0.10.1')
    })
  })
})
