import type * as tc from '@actions/tool-cache'
import { jest } from '@jest/globals'

export const find = jest.fn<typeof tc.find>()
export const downloadTool = jest.fn<typeof tc.downloadTool>()
export const extractZip = jest.fn<typeof tc.extractZip>()
export const cacheDir = jest.fn<typeof tc.cacheDir>()
