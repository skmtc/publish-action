/**
 * Unit tests for the input mapping, src/args.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const {
  cacheArgs,
  childEnv,
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
  cliVersion: '0.9.60',
  env: ''
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
      expect(publishArgs(baseInputs, 'jsr:@skmtc/cli@0.9.60')).toEqual([
        'run',
        '--no-config',
        '--minimum-dependency-age=0',
        '--no-prompt',
        '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN',
        '--allow-read=openapi.yaml',
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk',
        'jsr:@skmtc/cli@0.9.60',
        'api',
        'publish',
        'openapi.yaml',
        '--api',
        '@acme/pets',
        '--json'
      ])
    })

    it('passes no --origin-url when origin-url is empty', () => {
      const args = publishArgs(baseInputs, 'jsr:@skmtc/cli@0.9.60')

      expect(args).not.toContain('--origin-url')
    })

    it('appends the optional flags when their inputs are set', () => {
      const args = publishArgs(
        {
          ...baseInputs,
          visibility: 'private',
          originUrl: 'https://github.com/acme/pets/blob/main/openapi.yaml',
          env: 'staging'
        },
        'jsr:@skmtc/cli@0.9.60'
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

    it('never passes --token', () => {
      expect(publishArgs(baseInputs, 'x')).not.toContain('--token')
    })
  })

  describe('cacheArgs', () => {
    it('caches the specifier without config and without the age gate', () => {
      expect(cacheArgs('jsr:@skmtc/cli@0.9.60')).toEqual([
        'cache',
        '--no-config',
        '--minimum-dependency-age=0',
        'jsr:@skmtc/cli@0.9.60'
      ])
    })
  })

  describe('cliSpecifier', () => {
    it('pins the jsr specifier to the version', () => {
      expect(cliSpecifier('1.2.3', {})).toEqual({
        specifier: 'jsr:@skmtc/cli@1.2.3',
        overridden: false
      })
    })

    it('uses the test hook when it is set', () => {
      expect(
        cliSpecifier('1.2.3', {
          SKMTC_PUBLISH_ACTION_CLI_SPECIFIER: './test/fake-cli.js'
        })
      ).toEqual({ specifier: './test/fake-cli.js', overridden: true })
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

    it.each(['latest', '^0.9.60', '0.9', '0.9.60-rc.1', ' 0.9.60'])(
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
