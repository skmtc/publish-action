import type * as core from '@actions/core'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const error = jest.fn<typeof core.error>()
export const info = jest.fn<typeof core.info>()
export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
export const setSecret = jest.fn<typeof core.setSecret>()
export const warning = jest.fn<typeof core.warning>()

// A chainable stand-in for core.summary. Each method records its call and
// returns the stand-in; write() resolves to it.
export const summary = {
  addHeading: jest.fn(() => summary),
  addTable: jest.fn(() => summary),
  addRaw: jest.fn(() => summary),
  write: jest.fn(() => Promise.resolve(summary))
}

/** Restores the chain after jest.resetAllMocks() clears the implementations. */
export function resetSummary(): void {
  summary.addHeading.mockImplementation(() => summary)
  summary.addTable.mockImplementation(() => summary)
  summary.addRaw.mockImplementation(() => summary)
  summary.write.mockImplementation(() => Promise.resolve(summary))
}
