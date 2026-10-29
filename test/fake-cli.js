/* global Deno */
// A stand-in for `jsr:@skmtc/cli` in the integration job. The action runs it
// when SKMTC_PUBLISH_ACTION_CLI_SPECIFIER is `./test/fake-cli.js`.
//
// It prints a `published` result whose `revision` is the arguments it got, so
// the job can check them through the action's outputs. Without a token in
// SKMTC_HUB_TOKEN it fails as the real CLI does.

const result = Deno.env.get('SKMTC_HUB_TOKEN')
  ? {
      type: 'published',
      api: { account: 'skmtc', slug: 'publish-action-test' },
      revision: Deno.args.join(' '),
      url: 'https://skmtc.dev/@skmtc/publish-action-test',
      deduped: true,
      created: false,
      origin: 'https://api.skmtc.dev'
    }
  : { type: 'failed', code: 'unauthorized', message: 'no token' }

console.log(JSON.stringify(result, null, 2))

if (result.type === 'failed') {
  Deno.exit(1)
}
