import * as core from '@actions/core'

/** `skmtc api publish --json` on exit 0. */
export type Published = {
  type: 'published'
  api: { account: string; slug: string }
  revision: string
  url: string
  deduped: boolean
  created: boolean
}

/** `skmtc api publish --json` on exit 1. Any field after `message` can be missing. */
export type Failed = {
  type: 'failed'
  code: string
  message: string
  requestId?: string
  details?: { field?: string; message: string }[]
}

export type CliOutput = { exitCode: number; stdout: string; stderr: string }

/** The failure codes whose annotation points at the published file. */
const FILE_CODES = ['invalid-document', 'bad-request', 'file-unreadable']

/** The number of stderr lines a failure without JSON shows. */
const STDERR_TAIL_LINES = 20

/**
 * Maps the CLI's result: outputs and a summary on `published`, an annotation
 * on `failed`, the stderr tail on anything else. Fails the step on all but
 * `published`.
 */
export async function report(
  output: CliOutput,
  file: string,
  installLine: string
): Promise<void> {
  const result = parseResult(output.stdout)

  if (result?.type === 'published') {
    setOutputs(result)
    await writePublishedSummary(result, installLine)
    return
  }

  if (result?.type === 'failed') {
    // Fail before the summary write, which can throw.
    annotate(result, file)
    core.setFailed(
      `skmtc api publish failed: ${result.code}: ${result.message}`
    )
    await writeFailedSummary(result, installLine)
    return
  }

  core.setFailed(
    `skmtc api publish exited with code ${output.exitCode} and no JSON result.\n${stderrTail(output.stderr)}`
  )
}

/** Parses the CLI's stdout. Returns undefined for anything but a known result. */
export function parseResult(stdout: string): Published | Failed | undefined {
  let value: unknown

  try {
    value = JSON.parse(stdout)
  } catch {
    return undefined
  }

  if (!isObject(value)) {
    return undefined
  }

  if (
    value.type === 'published' &&
    isObject(value.api) &&
    typeof value.api.account === 'string' &&
    typeof value.api.slug === 'string' &&
    typeof value.revision === 'string' &&
    typeof value.url === 'string'
  ) {
    return {
      type: 'published',
      api: { account: value.api.account, slug: value.api.slug },
      revision: value.revision,
      url: value.url,
      deduped: value.deduped === true,
      created: value.created === true
    }
  }

  if (
    value.type === 'failed' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  ) {
    return {
      type: 'failed',
      code: value.code,
      message: value.message,
      requestId:
        typeof value.requestId === 'string' ? value.requestId : undefined,
      details: Array.isArray(value.details)
        ? value.details.filter(isDetail)
        : undefined
    }
  }

  return undefined
}

function setOutputs(result: Published): void {
  core.setOutput('revision', result.revision)
  core.setOutput('url', result.url)
  core.setOutput('deduped', String(result.deduped))
  core.setOutput('created', String(result.created))
}

function annotate(result: Failed, file: string): void {
  const lines = [
    result.message,
    ...(result.details ?? []).map((detail) =>
      detail.field ? `${detail.field}: ${detail.message}` : detail.message
    ),
    ...(result.requestId ? [`Request id: ${result.requestId}`] : [])
  ]

  core.error(lines.join('\n'), {
    title: `skmtc api publish: ${result.code}`,
    ...(FILE_CODES.includes(result.code) ? { file } : {})
  })
}

async function writePublishedSummary(
  result: Published,
  installLine: string
): Promise<void> {
  await core.summary
    .addHeading('skmtc api publish', 3)
    .addTable([
      [
        { data: 'API', header: true },
        { data: 'Revision', header: true },
        { data: 'Link', header: true },
        { data: 'Deduped', header: true },
        { data: 'Created', header: true }
      ],
      [
        escapeHtml(`@${result.api.account}/${result.api.slug}`),
        escapeHtml(result.revision),
        `<a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a>`,
        String(result.deduped),
        String(result.created)
      ]
    ])
    .addRaw(installLine, true)
    .write()
}

async function writeFailedSummary(
  result: Failed,
  installLine: string
): Promise<void> {
  await core.summary
    .addHeading('skmtc api publish failed', 3)
    .addTable([
      [
        { data: 'Code', header: true },
        { data: 'Message', header: true },
        { data: 'Request id', header: true }
      ],
      [
        escapeHtml(result.code),
        escapeHtml(result.message),
        // core.summary leaves an empty cell unclosed.
        escapeHtml(result.requestId ?? '-')
      ]
    ])
    .addRaw(installLine, true)
    .write()
}

function stderrTail(stderr: string): string {
  const lines = stderr.trimEnd().split('\n')
  const tail = lines.slice(-STDERR_TAIL_LINES).join('\n')

  return tail || '(stderr was empty)'
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDetail(
  value: unknown
): value is { field?: string; message: string } {
  return (
    isObject(value) &&
    typeof value.message === 'string' &&
    (value.field === undefined || typeof value.field === 'string')
  )
}
