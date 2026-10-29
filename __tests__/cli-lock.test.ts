/**
 * Checks that cli.lock locks DEFAULT_CLI_VERSION, so that a change to the
 * version without `npm run cli-lock` fails CI.
 */
import { readFileSync } from 'node:fs'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { CLI_LOCK_PATH, DEFAULT_CLI_VERSION } = await import('../src/args.js')

type DenoLock = {
  specifiers: Record<string, string>
  jsr: Record<string, unknown>
}

describe('cli.lock', () => {
  const lock: DenoLock = JSON.parse(readFileSync(CLI_LOCK_PATH, 'utf8'))

  it('resolves the default CLI specifier to the default version', () => {
    expect(lock.specifiers[`jsr:@skmtc/cli@${DEFAULT_CLI_VERSION}`]).toBe(
      DEFAULT_CLI_VERSION
    )
  })

  it('holds no other @skmtc/cli version', () => {
    expect(
      Object.keys(lock.jsr).filter((key) => key.startsWith('@skmtc/cli@'))
    ).toEqual([`@skmtc/cli@${DEFAULT_CLI_VERSION}`])
  })
})
