/**
 * Unit tests for the lock script, script/cli-lock.mjs, with a fake deno.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { DENO_VERSION } = await import('../src/args.js')
const { writeCliLock } = await import('../script/cli-lock.mjs')

const SPECIFIER = 'jsr:@skmtc/cli@0.0.1'

/**
 * A fake deno of `version`. `deno cache` writes `written` to the `--lock`
 * path, then fails when `cacheFails` is set, as a fetch that fails midway.
 */
function fakeDeno(
  version: string,
  { written, cacheFails }: { written: string; cacheFails: boolean }
) {
  return {
    denoVersion: () =>
      `deno ${version} (stable, release, x86_64-unknown-linux-gnu)\nv8 15.0\n`,
    denoCache: jest.fn((args: string[]) => {
      const lockFlag = args.find((arg) => arg.startsWith('--lock='))

      if (lockFlag) {
        writeFileSync(lockFlag.slice('--lock='.length), written)
      }

      if (cacheFails) {
        throw new Error('deno cache failed')
      }
    })
  }
}

describe('writeCliLock', () => {
  let dir: string
  let lockPath: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cli-lock-'))
    lockPath = path.join(dir, 'cli.lock')
    writeFileSync(lockPath, 'old lock')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the lock when deno cache succeeds', () => {
    const deno = fakeDeno(DENO_VERSION, {
      written: 'new lock',
      cacheFails: false
    })

    writeCliLock({ ...deno, lockPath, specifier: SPECIFIER })

    expect(deno.denoCache).toHaveBeenCalledWith(
      expect.arrayContaining(['cache', SPECIFIER])
    )
    expect(readFileSync(lockPath, 'utf8')).toBe('new lock')
    expect(readdirSync(dir)).toEqual(['cli.lock'])
  })

  it('leaves the lock untouched when deno cache fails', () => {
    const deno = fakeDeno(DENO_VERSION, {
      written: 'partial lock',
      cacheFails: true
    })

    expect(() =>
      writeCliLock({ ...deno, lockPath, specifier: SPECIFIER })
    ).toThrow('deno cache failed')
    expect(readFileSync(lockPath, 'utf8')).toBe('old lock')
    expect(readdirSync(dir)).toEqual(['cli.lock'])
  })

  it('exits before deno cache when the deno version differs', () => {
    const deno = fakeDeno('2.0.0', { written: 'new lock', cacheFails: false })

    expect(() =>
      writeCliLock({ ...deno, lockPath, specifier: SPECIFIER })
    ).toThrow(`deno on PATH is 2.0.0, not ${DENO_VERSION}.`)
    expect(deno.denoCache).not.toHaveBeenCalled()
    expect(readFileSync(lockPath, 'utf8')).toBe('old lock')
  })
})
