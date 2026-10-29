# Retro: skmtc/publish-action#8, the Deno version check, the atomic lock write and the major tag that never moves back

## 1. Summary

The ticket asked for three things. `script/cli-lock.mjs` checks the Deno version
and writes `cli.lock` atomically. `cli-lock.test.ts` asserts `lock.version`.
`release.yml` skips, with a notice, a release that is not the highest of its
major. All three were delivered in PR #9, squash-merged as 3e7ca667, with CI
green. Run `2026-10-29-jbwlpm`: 14m 17s wall clock (13m 09s agent), 25,670 input
/ 6.24M cached / 59,066 output tokens, about $4.32. implement was the most
costly step ($2.51, 7m 31s), plus the unrecorded tokens of a forked review. It
was worth it: the self-review found four real defects before the PR opened.

## 2. Findings

| What happened                                                                                                                                                                                                                   | Cost                                            | Kind        | The change that prevents it                                                                                                                                      | Issue  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The tests called `writeCliLock` but never ran the script's main block, so `process.exit(1)` and the main guard had no test. The light check caught this as blocking against the "done when" wording ("the lock script exits").  | 1 review round: address + check, ~2m 20s, $0.96 | workflow    | `implement-ticket-dg` implement prompt: when a "done when" item names what a script or CLI does, test it as a process (exit code, stderr), not only the function | triage |
| The ticket said to import `DENO_VERSION` from `src/install.ts`. Node type stripping cannot load that file, because its `./args.js` import does not resolve, so the author moved the constant to `src/args.ts`.                  | ~2 min, 1 diff note                             | ticket      | `orbital-ticket-prep`: when a ticket names an import for a Node-run script, run `node -e "import('<file>')"` and record the result in Context                    | triage |
| The ticket prescribed ranking by every `$major.*` tag. With that rule, an unpromoted newer prerelease tag stops a later hotfix release from moving `v1`. Self-review found it after implementation.                             | 0 this run (latent; deferred)                   | ticket      | Ticket prep for release logic: list the tag sets it must handle (pending rc, hotfix, promoted rc) as "done when" cases                                           | triage |
| My first wrapper in `cli-lock.mjs` piped `deno cache` stdout and dropped it, and the main guard compared `argv[1]` without `realpath`. Both were found by the forked `/code-review high`, whose tokens Orbital does not record. | 1 fix commit, ~2 min; unrecorded tokens         | tool-cost   | Orbital run_stats: record forked sub-agent tokens per step (as in #5's retro)                                                                                    | triage |
| The release workflow's wiring (`fetch-depth: 0`, the script call) cannot run outside a real `release` event. No step proved it.                                                                                                 | 0 this run; unproven                            | information | `ci.yml`: a job that checks out with `fetch-depth: 0` and runs `script/major-tag.sh` in dry mode against the repo's tags                                         | triage |

## 3. Keep

- Mutation checks run by both the author and the reviewer, one guard at a time,
  found the only gap (the untested `process.exit`). Already in the workflow
  prompts.
- Testing shell release logic against a temporary git repo with a bare origin
  exercises the real `git tag` sort and push. Note it in the README
  "Development" section.
- Running the real `npm run cli-lock` before and after a change, with an empty
  `git status`, proves a lock script is unchanged. Note it in the README too.

## 4. Deferred

- `script/major-tag.sh` (tag ranking): an unpromoted newer prerelease
  (`v1.4.0-rc1`) makes a later full hotfix release (`v1.3.1`) skip the move, and
  `v1` stays behind until the rc is promoted. A maintainer meets this on the
  first hotfix released while an rc is pending. Fix: rank only published
  non-prerelease releases (`gh release list`) plus `TAG_NAME`. Source: PR #9
  description, "Proposed, not built".
- `.github/workflows/release.yml`: there is no `concurrency` group and no tag
  fetch just before the comparison. When two releases are promoted seconds
  apart, the older one can force-push `v1` back. Source: self-review on PR #9.
- `__tests__/cli-lock-script.test.ts` (process tests) and
  `__tests__/major-tag.test.ts` use `sh` and a POSIX fake `deno`, so `npm test`
  fails for a maintainer on Windows without Git Bash. CI runs the tests only on
  ubuntu.
- `release.yml` wiring is unproven until the first real release. Whoever
  publishes `v1.0.0` should confirm in the job log that `v1` moved.
