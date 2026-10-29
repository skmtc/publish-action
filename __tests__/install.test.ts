/**
 * Unit tests for the Deno and CLI install, src/install.ts
 */
import * as path from 'node:path'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'
import * as tc from '../__fixtures__/tool-cache.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('@actions/tool-cache', () => tc)

const { cacheCli, DENO_VERSION, installDeno, zipName } =
  await import('../src/install.js')

describe('install.ts', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('zipName', () => {
    it.each([
      ['linux', 'x64', 'deno-x86_64-unknown-linux-gnu.zip'],
      ['linux', 'arm64', 'deno-aarch64-unknown-linux-gnu.zip'],
      ['darwin', 'x64', 'deno-x86_64-apple-darwin.zip'],
      ['darwin', 'arm64', 'deno-aarch64-apple-darwin.zip'],
      ['win32', 'x64', 'deno-x86_64-pc-windows-msvc.zip'],
      ['win32', 'arm64', 'deno-aarch64-pc-windows-msvc.zip']
    ] as const)('names the %s %s zip', (platform, arch, name) => {
      expect(zipName(platform, arch)).toBe(name)
    })

    it('rejects an unsupported architecture', () => {
      expect(() => zipName('linux', 'ia32')).toThrow(
        'Unsupported architecture ia32.'
      )
    })

    it('rejects an unsupported platform', () => {
      expect(() => zipName('aix', 'x64')).toThrow('Unsupported platform aix.')
    })
  })

  describe('installDeno', () => {
    it('uses the cached Deno by absolute path', async () => {
      tc.find.mockReturnValue('/tool-cache/deno/2.9.8/x64')

      await expect(installDeno('linux', 'x64')).resolves.toEqual({
        deno: path.join('/tool-cache/deno/2.9.8/x64', 'deno'),
        cached: true
      })
      expect(tc.find).toHaveBeenCalledWith('deno', DENO_VERSION, 'x64')
      expect(tc.downloadTool).not.toHaveBeenCalled()
    })

    it('downloads, extracts and caches the pinned Deno', async () => {
      tc.find.mockReturnValue('')
      tc.downloadTool.mockResolvedValue('/tmp/deno.zip')
      tc.extractZip.mockResolvedValue('/tmp/deno')
      tc.cacheDir.mockResolvedValue('/tool-cache/deno/2.9.8/x64')

      await expect(installDeno('win32', 'x64')).resolves.toEqual({
        deno: path.join('/tool-cache/deno/2.9.8/x64', 'deno.exe'),
        cached: false
      })
      expect(tc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip'
      )
      expect(tc.extractZip).toHaveBeenCalledWith('/tmp/deno.zip')
      expect(tc.cacheDir).toHaveBeenCalledWith(
        '/tmp/deno',
        'deno',
        '2.9.8',
        'x64'
      )
    })
  })

  describe('cacheCli', () => {
    it('runs deno cache with the pinned deno', async () => {
      exec.exec.mockResolvedValue(0)

      await cacheCli('/tool-cache/deno', 'jsr:@skmtc/cli@0.9.60')

      expect(exec.exec).toHaveBeenCalledWith('/tool-cache/deno', [
        'cache',
        '--no-config',
        '--minimum-dependency-age=0',
        'jsr:@skmtc/cli@0.9.60'
      ])
    })
  })
})
