/**
 * Unit tests for the output mapping, the summary and the annotation,
 * src/result.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { parseResult, report } = await import('../src/result.js')

const installLine = 'Installed Deno 2.9.8 and @skmtc/cli 0.9.60 in 10 ms'

const published = {
  type: 'published',
  api: { account: 'acme', slug: 'pets' },
  revision: 'abc123',
  url: 'https://skmtc.dev/@acme/pets/revisions/abc123',
  deduped: false,
  created: true,
  origin: 'https://api.skmtc.dev'
}

function cliOutput(exitCode: number, stdout: unknown, stderr = '') {
  return {
    exitCode,
    stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
    stderr
  }
}

describe('result.ts', () => {
  beforeEach(() => {
    core.resetSummary()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('published', () => {
    it('sets the four outputs as strings', async () => {
      await report(cliOutput(0, published), 'openapi.yaml', installLine)

      expect(core.setOutput.mock.calls).toEqual([
        ['revision', 'abc123'],
        ['url', 'https://skmtc.dev/@acme/pets/revisions/abc123'],
        ['deduped', 'false'],
        ['created', 'true']
      ])
      expect(core.setFailed).not.toHaveBeenCalled()
      expect(core.error).not.toHaveBeenCalled()
    })

    it('treats a missing deduped or created as false', async () => {
      const { revision, url, api, type } = published

      await report(
        cliOutput(0, { type, api, revision, url }),
        'openapi.yaml',
        installLine
      )

      expect(core.setOutput).toHaveBeenCalledWith('deduped', 'false')
      expect(core.setOutput).toHaveBeenCalledWith('created', 'false')
    })

    it('writes one summary table and the install line', async () => {
      await report(cliOutput(0, published), 'openapi.yaml', installLine)

      expect(core.summary.addTable).toHaveBeenCalledTimes(1)
      expect(core.summary.addTable).toHaveBeenCalledWith([
        [
          { data: 'API', header: true },
          { data: 'Revision', header: true },
          { data: 'Link', header: true },
          { data: 'Deduped', header: true },
          { data: 'Created', header: true }
        ],
        [
          '@acme/pets',
          'abc123',
          '<a href="https://skmtc.dev/@acme/pets/revisions/abc123">https://skmtc.dev/@acme/pets/revisions/abc123</a>',
          'false',
          'true'
        ]
      ])
      expect(core.summary.addRaw).toHaveBeenCalledWith(installLine, true)
      expect(core.summary.write).toHaveBeenCalledTimes(1)
    })
  })

  describe('failed', () => {
    it('annotates the file for invalid-document with details and request id', async () => {
      await report(
        cliOutput(1, {
          type: 'failed',
          code: 'invalid-document',
          status: 422,
          message: 'the document is not valid OpenAPI',
          requestId: 'req-1',
          details: [
            { field: 'paths./pets.get', message: 'responses is required' },
            { message: 'info.title is required' }
          ]
        }),
        'openapi.yaml',
        installLine
      )

      expect(core.error).toHaveBeenCalledTimes(1)
      expect(core.error).toHaveBeenCalledWith(
        [
          'the document is not valid OpenAPI',
          'paths./pets.get: responses is required',
          'info.title is required',
          'Request id: req-1'
        ].join('\n'),
        { title: 'skmtc api publish: invalid-document', file: 'openapi.yaml' }
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        'skmtc api publish failed: invalid-document: the document is not valid OpenAPI'
      )
      expect(core.setOutput).not.toHaveBeenCalled()
    })

    it.each(['bad-request', 'file-unreadable'])(
      'annotates the file for %s',
      async (code) => {
        await report(
          cliOutput(1, { type: 'failed', code, message: 'm' }),
          'openapi.yaml',
          installLine
        )

        expect(core.error).toHaveBeenCalledWith('m', {
          title: `skmtc api publish: ${code}`,
          file: 'openapi.yaml'
        })
      }
    )

    it.each([
      'unauthorized',
      'forbidden',
      'not-found',
      'conflict',
      'network',
      'hub-error'
    ])('does not annotate the file for %s', async (code) => {
      await report(
        cliOutput(1, { type: 'failed', code, message: 'm' }),
        'openapi.yaml',
        installLine
      )

      expect(core.error).toHaveBeenCalledWith('m', {
        title: `skmtc api publish: ${code}`
      })
      expect(core.setFailed).toHaveBeenCalledTimes(1)
    })

    it('handles a failure without status, request id or details', async () => {
      await report(
        cliOutput(1, {
          type: 'failed',
          code: 'network',
          message: 'cannot reach the hub'
        }),
        'openapi.yaml',
        installLine
      )

      expect(core.error).toHaveBeenCalledWith('cannot reach the hub', {
        title: 'skmtc api publish: network'
      })
      expect(core.summary.addTable).toHaveBeenCalledWith([
        [
          { data: 'Code', header: true },
          { data: 'Message', header: true },
          { data: 'Request id', header: true }
        ],
        ['network', 'cannot reach the hub', '-']
      ])
    })

    it('writes the code, message and request id to the summary', async () => {
      await report(
        cliOutput(1, {
          type: 'failed',
          code: 'unauthorized',
          message: 'the token is <invalid>',
          requestId: 'req-2'
        }),
        'openapi.yaml',
        installLine
      )

      expect(core.summary.addTable).toHaveBeenCalledWith([
        expect.any(Array),
        ['unauthorized', 'the token is &lt;invalid&gt;', 'req-2']
      ])
      expect(core.summary.write).toHaveBeenCalledTimes(1)
    })
  })

  describe('no JSON result', () => {
    it('fails with the stderr tail on exit 2', async () => {
      const stderr = [
        ...Array.from({ length: 30 }, (_, i) => `noise ${i}`),
        'Error: invalid --api "bad" — expected @account/slug'
      ].join('\n')

      await report(cliOutput(2, '', stderr), 'openapi.yaml', installLine)

      const message = core.setFailed.mock.calls[0][0]
      expect(message).toMatch(/^skmtc api publish exited with code 2/)
      expect(message).toContain('invalid --api "bad"')
      expect(message).toContain('noise 11')
      expect(message).not.toContain('noise 10\n')
      expect(core.error).not.toHaveBeenCalled()
      expect(core.setOutput).not.toHaveBeenCalled()
    })

    it('fails when exit 1 printed nothing on stdout (a crash)', async () => {
      await report(
        cliOutput(1, '', 'error: Uncaught NotCapable: Requires env access'),
        'openapi.yaml',
        installLine
      )

      expect(core.setFailed).toHaveBeenCalledWith(
        'skmtc api publish exited with code 1 and no JSON result.\nerror: Uncaught NotCapable: Requires env access'
      )
    })

    it('says so when stderr is empty', async () => {
      await report(cliOutput(1, ''), 'openapi.yaml', installLine)

      expect(core.setFailed).toHaveBeenCalledWith(
        'skmtc api publish exited with code 1 and no JSON result.\n(stderr was empty)'
      )
    })
  })

  describe('parseResult', () => {
    it.each([
      ['not JSON', 'Downloading jsr:@skmtc/cli'],
      ['an array', '[]'],
      ['null', 'null'],
      ['an unknown type', '{"type":"other"}'],
      ['published without a revision', '{"type":"published","url":"u"}'],
      ['failed without a message', '{"type":"failed","code":"network"}']
    ])('returns undefined for %s', (_, stdout) => {
      expect(parseResult(stdout)).toBeUndefined()
    })

    it('drops malformed details', () => {
      expect(
        parseResult(
          JSON.stringify({
            type: 'failed',
            code: 'bad-request',
            message: 'm',
            details: [{ message: 'ok' }, { field: 1, message: 'x' }, 'text']
          })
        )
      ).toEqual({
        type: 'failed',
        code: 'bad-request',
        message: 'm',
        requestId: undefined,
        details: [{ message: 'ok' }]
      })
    })
  })
})
