import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { cacheArgs } from './args.js'

/** The Deno version the action downloads. The action never uses a PATH deno. */
export const DENO_VERSION = '2.9.8'

/**
 * Finds the pinned Deno in the tool cache, or downloads and caches it.
 * Logic from denoland/setup-deno `src/install.ts`, without `addPath`.
 *
 * @returns The absolute path of the deno binary, and whether it was cached.
 */
export async function installDeno(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): Promise<{ deno: string; cached: boolean }> {
  const binary = platform === 'win32' ? 'deno.exe' : 'deno'
  const cachedPath = tc.find('deno', DENO_VERSION)

  if (cachedPath) {
    core.info(`Using cached Deno ${DENO_VERSION} from ${cachedPath}.`)
    return { deno: path.join(cachedPath, binary), cached: true }
  }

  const url = `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${zipName(platform, arch)}`
  core.info(`Downloading Deno from ${url}.`)

  const zipPath = await tc.downloadTool(url)
  const extractedFolder = await tc.extractZip(zipPath)
  const newCachedPath = await tc.cacheDir(extractedFolder, 'deno', DENO_VERSION)
  core.info(`Cached Deno to ${newCachedPath}.`)

  return { deno: path.join(newCachedPath, binary), cached: false }
}

/** Downloads the CLI and its dependencies into the Deno cache. */
export async function cacheCli(deno: string, specifier: string): Promise<void> {
  await exec.exec(deno, cacheArgs(specifier))
}

/** The name of the Deno release zip for a platform and architecture. */
export function zipName(platform: NodeJS.Platform, arch: string): string {
  const denoArch = DENO_ARCHES[arch]
  const denoPlatform = DENO_PLATFORMS[platform]

  if (!denoArch) {
    throw new Error(`Unsupported architecture ${arch}.`)
  }

  if (!denoPlatform) {
    throw new Error(`Unsupported platform ${platform}.`)
  }

  return `deno-${denoArch}-${denoPlatform}.zip`
}

const DENO_ARCHES: Record<string, string | undefined> = {
  arm64: 'aarch64',
  x64: 'x86_64'
}

const DENO_PLATFORMS: Partial<Record<NodeJS.Platform, string>> = {
  linux: 'unknown-linux-gnu',
  darwin: 'apple-darwin',
  win32: 'pc-windows-msvc'
}
