# Retro: skmtc/publish-action#2, the optional token and GitHub Actions OIDC

## 1. Summary

The ticket asked to make `token` optional so that CLI 0.10.0 signs in with
GitHub Actions OIDC, with narrow `--allow-env`/`--allow-net` widening only
without a token, a new lock, CI and README. All of it was delivered in PR #11,
squash-merged as 1d9cfbb2, with CI green on main. Run `2026-10-29-5w6o3q`: 28m
42s wall clock (23m 16s agent, 4m 21s queued), 23,224 input / 13.8M cached /
126,353 output tokens, about $9.10. review was the most costly step ($3.86, 10m
36s). It was worth it: it found a README gap the author could not see and
confirmed the fork-PR CI regression.

## 2. Findings

| What happened                                                                                                                                                                                                         | Cost                                            | Kind      | The change that prevents it                                                                                                                       | Issue  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The new tokenless CI step failed on every fork pull request. The author found it in self-review but filed it as "Proposed, not built" (a guard), so the review step had to raise it again.                            | 1 review round: address + check, ~2m 35s, $1.17 | workflow  | `implement-ticket-dg` implement prompt: a regression that the author's own diff causes in an existing check is a defect to fix, not a "new guard" | triage |
| The README said "link the repository", but the hub also matches the link's workflow file and optional environment. The ticket's Context did not say so; the reviewer found it in skmtc-hub `matchesLinkedRepository`. | 1 should-fix, part of the same round            | ticket    | `orbital-ticket-prep`: when a ticket documents a server-side rule, quote the rule (here the matching fields) in Context with its file             | triage |
| Twice I ran `prettier --check ... \| tail -1 && git commit`. The pipe hid the failure, so an unformatted README was committed and had to be amended.                                                                  | ~3 min, 2 amends                                | check     | `.orbital/bootstrap.sh`: install a pre-commit hook that runs `npm run format:check`                                                               | triage |
| I undid a remove-the-line mutation with `git checkout -- src/args.ts`, which also wiped the uncommitted nit fix, so I had to apply it again.                                                                          | ~1 min                                          | workflow  | implement and address prompts: commit (or WIP-commit) before remove-the-line checks, then undo them with `git checkout`                           | triage |
| The forked `/code-review` runs in implement and review are not in the token figures, so the two most costly rows understate their cost (this is the third retro to say so).                                           | unrecorded tokens                               | tool-cost | Orbital run_stats: record the tokens of forked sub-agents per step                                                                                | triage |

## 3. Keep

- Running the built `dist/index.js` against the real CLI with fake env vars
  (exit 2, `oidc-token`, `origin-url` refusal) proved the error paths with no
  hub. Add it to the README "Development" section.
- Fetching the pinned CLI source from `jsr.io/@skmtc/cli/<v>/...` gave the exact
  stderr text and env reads to test against. Note it in ticket prep.
- Remove-the-line checks, one guard per round, showed every rule had a test.

## 4. Deferred

- `src/main.ts:22`, `src/args.ts` `childEnv`: no log line says that an empty
  token switches the action to OIDC, or that the action drops an inherited
  `SKMTC_HUB_TOKEN`. A PAT user whose secret name is wrong gets an OIDC error
  that does not name the empty input. Already tracked as #12. Source:
  https://github.com/skmtc/publish-action/pull/11#issuecomment-6504632742
- `test/fake-cli.js`: on a missing OIDC permission the fake prints JSON and
  exits 1; the real CLI 0.10.0 exits 2 with stderr. CI does not run the action's
  real missing-permission path (unit tests do). Source: PR #11 "Not built".
- README install-time table: the figures are for CLI 0.9.60. Measure 0.10.0 from
  a `test-action` log.
- A real OIDC exchange against the hub is unproven. It needs a linked public
  repository and a first publish with a PAT. The first user of the tokenless
  workflow will be the first to run it.
- `.github/workflows/ci.yml`: the fork-PR skip is verified only by reading the
  `if:`, because no fork pull request has run yet.
