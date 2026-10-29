/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * The CLI is stubbed: @actions/exec and @actions/tool-cache are fixtures, so
 * no Deno is downloaded and no command runs.
 */
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'
import * as tc from '../__fixtures__/tool-cache.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('@actions/tool-cache', () => tc)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

// src/ and __tests__/ both sit one level below the action root.
const LOCK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'cli.lock'
)
const TOKEN = 'skmtc_pat_secret'
const TOOL_DIR = '/tool-cache/deno/2.9.8/x64'
const DENO = path.join(
  TOOL_DIR,
  process.platform === 'win32' ? 'deno.exe' : 'deno'
)

const published = JSON.stringify({
  type: 'published',
  api: { account: 'acme', slug: 'pets' },
  revision: 'abc123',
  url: 'https://skmtc.dev/@acme/pets/revisions/abc123',
  deduped: true,
  created: false,
  origin: 'https://api.skmtc.dev'
})

function mockInputs(inputs: Record<string, string>): void {
  core.getInput.mockImplementation((name) => inputs[name] ?? '')
}

function publishCall() {
  const [command, args, options] = exec.getExecOutput.mock.calls[0]
  return { command, args: args ?? [], options }
}

/**
 * Variables the tests set. CI runs with `GITHUB_ACTIONS=true`, so each test
 * starts with them unset and the suite restores them.
 */
const ENV_VARS = [
  'SKMTC_PUBLISH_ACTION_CLI_SPECIFIER',
  'SKMTC_HUB_TOKEN',
  'GITHUB_ACTIONS',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN'
]

const OIDC_REQUEST_URL =
  'https://run-actions-1-azure-eastus.actions.githubusercontent.com/42/idtoken/abc/def?api-version=2.0'

describe('main.ts', () => {
  const saved = ENV_VARS.map((name) => [name, process.env[name]] as const)

  beforeEach(() => {
    for (const name of ENV_VARS) {
      delete process.env[name]
    }
    core.resetSummary()
    mockInputs({ file: 'openapi.yaml', api: '@acme/pets', token: TOKEN })
    tc.find.mockReturnValue(TOOL_DIR)
    exec.exec.mockResolvedValue(0)
    exec.getExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: published,
      stderr: ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  })

  it('masks the token before it reads any other input', async () => {
    await run()

    expect(core.getInput.mock.calls[0]).toEqual(['token'])
    expect(core.setSecret).toHaveBeenCalledWith(TOKEN)
    expect(core.setSecret.mock.invocationCallOrder[0]).toBeLessThan(
      core.getInput.mock.invocationCallOrder[1]
    )
  })

  it('passes the token in env, never in argv, and keeps PATH', async () => {
    await run()

    const { args, options } = publishCall()
    expect(args).not.toContain('--token')
    expect(args.join(' ')).not.toContain(TOKEN)
    expect(options?.env?.SKMTC_HUB_TOKEN).toBe(TOKEN)
    expect(options?.env?.PATH).toBe(process.env.PATH)
    expect(options?.ignoreReturnCode).toBe(true)
  })

  it('allows no OIDC variables or host with a token, even in an OIDC job', async () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL = OIDC_REQUEST_URL
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'request-token'

    await run()

    const { args } = publishCall()
    expect(args).toContain(
      '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN'
    )
    expect(args).toContain(
      '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk'
    )
  })

  describe('without a token', () => {
    beforeEach(() => {
      mockInputs({ file: 'openapi.yaml', api: '@acme/pets' })
      process.env.GITHUB_ACTIONS = 'true'
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = OIDC_REQUEST_URL
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'request-token'
    })

    it('masks nothing and does not fail on the empty input', async () => {
      await run()

      expect(core.getInput.mock.calls[0]).toEqual(['token'])
      expect(core.setSecret).not.toHaveBeenCalled()
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('gives the CLI no SKMTC_HUB_TOKEN, even an inherited one', async () => {
      process.env.SKMTC_HUB_TOKEN = 'inherited'

      await run()

      const { args, options } = publishCall()
      expect(args).not.toContain('--token')
      expect(options?.env).not.toHaveProperty('SKMTC_HUB_TOKEN')
      expect(options?.env?.ACTIONS_ID_TOKEN_REQUEST_URL).toBe(OIDC_REQUEST_URL)
    })

    it('allows the OIDC variables and the host of the request URL', async () => {
      await run()

      const { args } = publishCall()
      expect(args).toContain(
        '--allow-env=SKMTC_HUB_TOKEN,SKMTC_ENV,SKMTC_API_ORIGIN,GITHUB_ACTIONS,ACTIONS_ID_TOKEN_REQUEST_URL,ACTIONS_ID_TOKEN_REQUEST_TOKEN'
      )
      expect(args).toContain(
        '--allow-net=api.skmtc.dev,api.skmtc.net,api.skmtc.co.uk,run-actions-1-azure-eastus.actions.githubusercontent.com'
      )
    })

    it('fails with the CLI missing-permission text on exit 2', async () => {
      // CLI 0.10.0's stderr, shortened.
      const stderr = [
        'Error: missing required argument: --token',
        '',
        'Discover valid values: Running in GitHub Actions without an OIDC token. Add `permissions: id-token: write` to the job (a pull request from a fork never gets one), or run `skmtc login`, set $SKMTC_HUB_TOKEN, or pass --token.'
      ].join('\n')
      exec.getExecOutput.mockResolvedValue({ exitCode: 2, stdout: '', stderr })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        `skmtc api publish exited with code 2 and no JSON result.\n${stderr}`
      )
    })
  })

  it('runs the pinned CLI with the pinned Deno by absolute path', async () => {
    await run()

    expect(exec.exec).toHaveBeenCalledWith(DENO, [
      'cache',
      '--no-config',
      '--minimum-dependency-age=0',
      `--lock=${LOCK}`,
      '--frozen',
      'jsr:@skmtc/cli@0.10.0'
    ])
    const { command, args } = publishCall()
    expect(command).toBe(DENO)
    expect(args).toContain('jsr:@skmtc/cli@0.10.0')
  })

  it('locks the default version on both deno calls', async () => {
    await run()

    const cacheCall = exec.exec.mock.calls[0][1] ?? []
    for (const args of [cacheCall, publishCall().args]) {
      expect(args).toContain(`--lock=${LOCK}`)
      expect(args).toContain('--frozen')
    }
  })

  it('runs a custom cli-version unlocked on both deno calls', async () => {
    mockInputs({
      file: 'openapi.yaml',
      api: '@acme/pets',
      token: TOKEN,
      'cli-version': '0.9.59'
    })

    await run()

    const cacheCall = exec.exec.mock.calls[0][1] ?? []
    expect(cacheCall).toContain('jsr:@skmtc/cli@0.9.59')
    expect(publishCall().args).toContain('jsr:@skmtc/cli@0.9.59')
    for (const args of [cacheCall, publishCall().args]) {
      expect(args.some((arg) => arg.startsWith('--lock'))).toBe(false)
      expect(args).not.toContain('--frozen')
    }
  })

  it('passes no --origin-url when origin-url is empty', async () => {
    await run()

    expect(publishCall().args).not.toContain('--origin-url')
  })

  it('passes --origin-url when origin-url is set', async () => {
    mockInputs({
      file: 'openapi.yaml',
      api: '@acme/pets',
      token: TOKEN,
      'origin-url': 'https://github.com/acme/pets/blob/main/openapi.yaml'
    })

    await run()

    const { args } = publishCall()
    expect(args[args.indexOf('--origin-url') + 1]).toBe(
      'https://github.com/acme/pets/blob/main/openapi.yaml'
    )
  })

  it('sets the outputs on published', async () => {
    await run()

    expect(core.setOutput).toHaveBeenCalledWith('revision', 'abc123')
    expect(core.setOutput).toHaveBeenCalledWith('deduped', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('created', 'false')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('logs the install time and puts it in the summary', async () => {
    await run()

    const line = expect.stringMatching(
      /^Installed Deno 2\.9\.8 and @skmtc\/cli 0\.10\.0 in \d+ ms \(deno cached: yes\)$/
    )
    expect(core.info).toHaveBeenCalledWith(line)
    expect(core.summary.addRaw).toHaveBeenCalledWith(line, true)
  })

  it('uses the test hook specifier and skips deno cache', async () => {
    process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER = './test/fake-cli.js'

    await run()

    expect(exec.exec).not.toHaveBeenCalled()
    expect(publishCall().args).toContain('./test/fake-cli.js')
    expect(publishCall().args).not.toContain('jsr:@skmtc/cli@0.10.0')
  })

  it('fails before installing on an invalid cli-version', async () => {
    mockInputs({
      file: 'openapi.yaml',
      api: '@acme/pets',
      token: TOKEN,
      'cli-version': 'latest'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('cli-version "latest"')
    )
    expect(tc.find).not.toHaveBeenCalled()
    expect(exec.getExecOutput).not.toHaveBeenCalled()
  })

  it('fails when deno cache fails', async () => {
    exec.exec.mockRejectedValue(new Error('deno cache exited with code 1'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('deno cache exited with code 1')
    expect(exec.getExecOutput).not.toHaveBeenCalled()
  })

  it('fails with the stderr tail on exit 2', async () => {
    exec.getExecOutput.mockResolvedValue({
      exitCode: 2,
      stdout: '',
      stderr: 'Error: invalid --api "pets" — expected @account/slug'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('invalid --api "pets"')
    )
  })
})
