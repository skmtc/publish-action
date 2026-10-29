# Retro: skmtc/publish-action#1, the publish action

## 1. Summary

The ticket asked for a TypeScript JavaScript action that installs a pinned Deno
and `@skmtc/cli` and runs `skmtc api publish`. It also asked for unit tests, a
three-OS integration job, CI install timings in the README and a release
workflow. All of it was delivered in PR #3, squash-merged as b9cdef1, with CI
green on main. Run `2026-10-29-hfjbq6`: 37m 06s wall clock (29m 55s agent),
23,862 input / 17.6M cached / 159,851 output tokens, about $10.69. The most
costly step was review ($4.94, 14m 51s). It was worth it: it found both blockers
from CI logs that the author could not see before the push.

## 2. Findings

| What happened                                                                                                                                                                                                                           | Cost                                                          | Kind     | The change that prevents it                                                                                                            | Issue                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tslib` was only an optional transitive dependency after `@github/local-action` was dropped. `npm ci` on macOS installed it, so the author's local `npm run bundle` passed, but `Check dist/` failed on ubuntu. The reviewer caught it. | 1 review round (address 6m 52s, check 1m 05s, part of review) | workflow | `implement-ticket-dg`: after `open_pr`, wait for the PR's CI and route a red check back to the author before `review` starts           | triage                                                             |
| A Done-when ("CI timings in the README") could only be met from the PR's own CI run. The author left "to measure" rows, and the reviewer had to read the logs and block.                                                                | 1 review round (shared with the row above)                    | ticket   | `orbital-ticket-prep`: mark Done-when items that need post-push CI as "fill in during address", or give the author a step that sees CI | triage                                                             |
| In address, a background `until` loop that waited for PR CI was stopped when the session ended. The step resumed and the handoff came late.                                                                                             | ~6 min of address wall clock against 45 s of agent time       | workflow | Give agents a sanctioned CI-wait command step (orbital-workflows#92)                                                                   | [#92](https://github.com/dmitrigrabov/orbital-workflows/issues/92) |
| The ticket's threshold "well over about 15 s" left the author to judge Windows 18.4 s alone. The decision went back to the owner through deferred item 4.                                                                               | Extra reply text, plus one owner decision                     | ticket   | `orbital-ticket-prep`: state numeric thresholds as a hard number with the action to take                                               | triage                                                             |
| The template's `allowDefaultProject` matched more than 8 files once tests were added, so `npm run lint` failed. The fix was found only by reading ESLint output.                                                                        | ~2 min                                                        | ticket   | Context "Traps": note the template's 8-file default-project limit when the ticket adds test files                                      | none: one-off scaffold                                             |
| The README was edited after `npm run bundle` (which runs prettier), so 2391dcd was committed unformatted and needed the reflow commit 1c224d7.                                                                                          | 1 extra commit                                                | check    | Add `.orbital/bootstrap.sh`-installed pre-commit `prettier --check` on staged files                                                    | triage                                                             |

## 3. Keep

- Mutation checks on each guarded line (remove it, see a named test fail,
  restore it) caught nothing missing and proved the guards. Already in the
  workflow prompt.
- Running the bundled `dist/index.js` locally with `RUNNER_TOOL_CACHE`,
  `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` set found the unclosed empty summary
  cell. Write this down in the repo README "Development" section.

## 4. Deferred

- `src/args.ts:21`: `--minimum-dependency-age=0` with `--no-config` and no
  lockfile resolves the CLI's floating ranges fresh, while `SKMTC_HUB_TOKEN` is
  readable. Every cold run is exposed to a just-published bad dependency.
  Proposed: a frozen lockfile for the default CLI version
  ([deferred 1](https://github.com/skmtc/publish-action/pull/3#issuecomment-6498836399)).
- `.github/workflows/ci.yml` real-CLI steps assert only `outcome == failure`, so
  a CLI crash passes CI too. Proposed: assert the `file-unreadable` annotation
  or an output (deferred 2; also self-review item b).
- `.github/workflows/release.yml` triggers on `published`, so a prerelease later
  promoted to a full release never moves `v1`. Proposed: `types: [released]`
  (deferred 3).
- README install table: the Windows cold install is 18.4 s against the ticket's
  ~15 s mark. The owner decides whether to file the skmtc/skmtc compiled-binary
  follow-up (deferred 4).
- `src/result.ts` `report()`: on `published`, a failing `core.summary.write()`
  (no `GITHUB_STEP_SUMMARY`, e.g. under `act`) fails a successful publish.
  Proposed: downgrade it to `core.warning` (self-review a).
- `src/args.ts` `--allow-read=${file}`: a path with a comma is split by Deno's
  permission list, so the read is denied. Proposed: reject such paths
  (self-review c).
- A real `published` run against api.skmtc.dev was never made (no token), and
  `release.yml` has not run yet (no release). Both are met first by the owner
  cutting v1.0.0.
