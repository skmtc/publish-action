/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * The CLI is stubbed: @actions/exec and @actions/tool-cache are fixtures, so
 * no Deno is downloaded and no command runs.
 */
import * as path from 'node:path'
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

describe('main.ts', () => {
  const savedSpecifier = process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER

  beforeEach(() => {
    delete process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER
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
    if (savedSpecifier === undefined) {
      delete process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER
    } else {
      process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER = savedSpecifier
    }
  })

  it('masks the token before it reads any other input', async () => {
    await run()

    expect(core.getInput.mock.calls[0]).toEqual(['token', { required: true }])
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

  it('runs the pinned CLI with the pinned Deno by absolute path', async () => {
    await run()

    expect(exec.exec).toHaveBeenCalledWith(DENO, [
      'cache',
      '--no-config',
      '--minimum-dependency-age=0',
      'jsr:@skmtc/cli@0.9.60'
    ])
    const { command, args } = publishCall()
    expect(command).toBe(DENO)
    expect(args).toContain('jsr:@skmtc/cli@0.9.60')
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
      /^Installed Deno 2\.9\.8 and @skmtc\/cli 0\.9\.60 in \d+ ms \(deno cached: yes\)$/
    )
    expect(core.info).toHaveBeenCalledWith(line)
    expect(core.summary.addRaw).toHaveBeenCalledWith(line, true)
  })

  it('uses the test hook specifier and skips deno cache', async () => {
    process.env.SKMTC_PUBLISH_ACTION_CLI_SPECIFIER = './test/fake-cli.js'

    await run()

    expect(exec.exec).not.toHaveBeenCalled()
    expect(publishCall().args).toContain('./test/fake-cli.js')
    expect(publishCall().args).not.toContain('jsr:@skmtc/cli@0.9.60')
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
