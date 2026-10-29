# skmtc publish action

Publish an OpenAPI document to [skmtc.dev](https://skmtc.dev) as a revision of a
hub API.

The action runs `skmtc api publish` from
[`@skmtc/cli`](https://jsr.io/@skmtc/cli). It downloads a pinned Deno, caches a
pinned CLI version, runs the CLI in JSON mode and maps its result to outputs, a
job summary and annotations. It holds no upload logic of its own.

## Usage

Publish on each push to `main`:

```yaml
name: Publish API

on:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - id: publish
        # Pin to a full commit SHA. The comment records the release.
        uses: skmtc/publish-action@<full-commit-sha> # v1.0.0
        with:
          file: openapi.yaml
          api: '@acme/pets'
          token: ${{ secrets.SKMTC_HUB_TOKEN }}

      - run: echo "Published ${{ steps.publish.outputs.url }}"
```

Pin `uses:` to a full commit SHA, not to a tag: a tag can move, a SHA cannot.
See
[Using third-party actions](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions).

> [!WARNING]
>
> Do not run this action from a `pull_request_target` workflow. That trigger
> gives code from a fork access to your secrets, and so to your skmtc.dev token.
> Publish from `push` to your default branch.

### The first publish

The first publish creates the API. Set `visibility` for that run only:

```yaml
with:
  file: openapi.yaml
  api: '@acme/pets'
  token: ${{ secrets.SKMTC_HUB_TOKEN }}
  visibility: private
```

Then remove `visibility`. A publish with `visibility` to an API that exists does
not send webhook events or pipeline deliveries, and drops `origin-url`
(skmtc/skmtc-hub#2146).

### The origin URL

`origin-url` has no default. The hub records it as the source of the document,
refetches it daily, and finds duplicate sources by URL. A URL with a commit SHA
would add a source on every publish, and the hub cannot refetch a URL in a
private repository.

For a public repository, you can set the URL of the file on the default branch,
so the hub keeps the API current if CI stops:

```yaml
with:
  origin-url:
    https://github.com/${{ github.repository }}/blob/${{
    github.event.repository.default_branch }}/openapi.yaml
```

## Inputs

| Input         | Required | Description                                                                                |
| ------------- | -------- | ------------------------------------------------------------------------------------------ |
| `file`        | yes      | Path of the OpenAPI document.                                                              |
| `api`         | yes      | The hub API, as `@account/slug`.                                                           |
| `token`       | yes      | A skmtc.dev personal access token. Store it as a secret.                                   |
| `visibility`  | no       | `public` or `private`. Set it for the first publish only, which creates the API.           |
| `origin-url`  | no       | A URL the hub refetches daily. No default. See [The origin URL](#the-origin-url).          |
| `cli-version` | no       | The exact `@skmtc/cli` version, such as `0.9.60`. Empty means the version the action pins. |
| `env`         | no       | The hub environment. Empty means production.                                               |

### The CLI version and its dependencies

`@skmtc/cli` declares its dependencies as version ranges. For the version the
action pins, the action ships a Deno lockfile, `cli.lock`, and runs `deno cache`
and `deno run` with `--lock=<action dir>/cli.lock --frozen`. Each run then gets
the same dependency versions, and Deno stops when a downloaded file does not
match its hash in the lockfile.

A custom `cli-version` is not locked. Deno resolves the newest dependency
versions that match the CLI's ranges, on each runner. Those dependencies run
while the token is readable. Set `cli-version` only to a version you trust with
its dependencies as they are on the day of the run.

## Outputs

| Output     | Description                                                          |
| ---------- | -------------------------------------------------------------------- |
| `revision` | The content ref of the revision.                                     |
| `url`      | The URL of the revision on skmtc.dev.                                |
| `deduped`  | `'true'` when the hub already had these bytes and added no revision. |
| `created`  | `'true'` when the publish created the API.                           |

The action sets the outputs only when the publish succeeds. When it fails, the
step fails with an error annotation. For an invalid document, a bad request or a
file it cannot read, the annotation points at `file`.

## Install time

The action downloads Deno and caches `@skmtc/cli` with its dependencies, in each
job. A warm install is a second run in the same job.

| Runner                                      | Cold install | Warm install |
| ------------------------------------------- | ------------ | ------------ |
| `ubuntu-latest`                             | 6.4 s        | 0.3 s        |
| `macos-latest`                              | 8.7 s        | 0.6 s        |
| `windows-latest`                            | 18.4 s       | 0.7 s        |
| macOS arm64 (local, Deno 2.9.8, CLI 0.9.60) | 9.1 s        | 1.2 s        |

The CI rows come from one run of the `GitHub Actions Test` job of the
[CI workflow](.github/workflows/ci.yml), with Deno 2.9.8 and CLI 0.9.60
([run 40885678489](https://github.com/skmtc/publish-action/actions/runs/40885678489)).
Each run logs `Installed Deno <version> and @skmtc/cli <version> in <n> ms`.

## Development

```sh
npm ci
npm run format:check && npm run lint && npm run ci-test
npm run bundle
```

Commit `dist/` with each change to `src/`. The `Check Transpiled JavaScript`
workflow fails when `dist/` does not match the source.

When you change `DEFAULT_CLI_VERSION` or `DENO_VERSION` in `src/args.ts`, write
the lockfile again and commit it:

```sh
npm run cli-lock
```

The script needs `deno` on `PATH`, at the version in `DENO_VERSION`. It stops
when the versions differ. When `deno cache` fails, the script keeps the old
`cli.lock`. The `cli.lock` test fails when `cli.lock` does not lock
`DEFAULT_CLI_VERSION`, or has a lockfile format other than Deno 2.9.8's.

## Releases

Publish a GitHub release with a tag such as `v1.2.3`. The `Move Major Tag`
workflow then moves `v1` to that release. A prerelease does not move the tag
until you promote it to a full release. A release that is not the highest `v1`
release does not move the tag. For example, when you promote `v1.1.0-rc1` after
`v1.3.0`, `v1` stays at `v1.3.0`.
