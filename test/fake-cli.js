/* global Deno */
// A stand-in for `jsr:@skmtc/cli` in the integration job. The action runs it
// when SKMTC_PUBLISH_ACTION_CLI_SPECIFIER is `./test/fake-cli.js`.
//
// It prints a `published` result whose `revision` is the arguments it got, so
// the job can check them through the action's outputs. Without a token in
// SKMTC_HUB_TOKEN it signs in as the real CLI does with GitHub Actions OIDC:
// it needs GITHUB_ACTIONS=true, both ACTIONS_ID_TOKEN_* variables readable and
// net permission to the host of the request URL. Its revision then starts with
// `oidc`. Else it fails as the real CLI does.

/** A variable the process may not read counts as unset, as in the real CLI. */
function readEnv(name) {
  try {
    return Deno.env.get(name)
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined
    throw error
  }
}

function canSignInWithOidc() {
  const requestUrl = readEnv('ACTIONS_ID_TOKEN_REQUEST_URL')

  return (
    readEnv('GITHUB_ACTIONS') === 'true' &&
    Boolean(readEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN')) &&
    URL.canParse(requestUrl ?? '') &&
    Deno.permissions.querySync({
      name: 'net',
      host: new URL(requestUrl).host
    }).state === 'granted'
  )
}

function published(revision) {
  return {
    type: 'published',
    api: { account: 'skmtc', slug: 'publish-action-test' },
    revision,
    url: 'https://skmtc.dev/@skmtc/publish-action-test',
    deduped: true,
    created: false,
    origin: 'https://api.skmtc.dev'
  }
}

const args = Deno.args.join(' ')

const result = readEnv('SKMTC_HUB_TOKEN')
  ? published(args)
  : canSignInWithOidc()
    ? published(`oidc ${args}`)
    : { type: 'failed', code: 'unauthorized', message: 'no token' }

console.log(JSON.stringify(result, null, 2))

if (result.type === 'failed') {
  Deno.exit(1)
}
