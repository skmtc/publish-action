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
  specifiers: Record<string, unknown>
  jsr: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readLock(): DenoLock {
  const lock: unknown = JSON.parse(readFileSync(CLI_LOCK_PATH, 'utf8'))

  if (!isRecord(lock) || !isRecord(lock.specifiers) || !isRecord(lock.jsr)) {
    throw new Error(`${CLI_LOCK_PATH} has no specifiers and jsr sections`)
  }

  return { specifiers: lock.specifiers, jsr: lock.jsr }
}

describe('cli.lock', () => {
  const lock = readLock()

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
