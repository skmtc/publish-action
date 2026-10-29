# Retro: #12 sign-in log lines, #14 private linked repositories

## 1. Summary

- Ticket: log the sign-in method when `token` is empty (#12), fix the stale visibility paragraph, and fold in #14 (README: linked repositories can be private).
- Delivered: PR #15, squash-merged as c3fca709. CI on main is green. #12 and #14 are closed.
- Run `2026-10-29-paihmv`: 6m 05s wall clock, 5m 02s agent time.
- Tokens: 18,424 input, 1,918,119 cached, 16,659 output. Estimated cost $1.41.
- Costliest step: `implement` ($0.37, 1m 43s). The `check` step cost $0.40 on Opus for a clean result.
- No rework: the review found nothing and no fix round was needed.

## 2. Findings

| What happened | Cost | Kind | The change that prevents it | Issue |
| --- | --- | --- | --- | --- |
| `check` ran on Opus for a light-depth diff of two info lines and README text; it found nothing | $0.40, the largest step cost | workflow | Route `check` to a cheaper model when `review_depth` is light and the `light_check` result is clean | triage |
| The PR body had backslash-escaped backticks (my heredoc escaped them), so GitHub shows literal backslashes | 0 rounds; cosmetic, noted by reviewer | steering | Add to the open_pr prompt: write the body from a quoted heredoc and do not escape backticks | triage |
| The author step skipped the separate `/review high` pass and said so; the light check redid the mutation checks | about 1 min of duplicate mutation work | workflow | Say in the implement prompt that `/review high` is skipped when `review_depth` is light | triage |
| Mutation checks for the "with a token" case needed a scratch `sed` edit to move the else branch | seconds | tool-cost | None needed; the edit was reverted from a backup | none: trivial |

## 3. Keep

- The ticket's Context section (file lines, traps, test names to copy) meant no exploration; keep it in ticket prep.
- Folding the README ticket in with one commit and one closing keyword per ticket, checked by `closingIssuesReferences`.
- Mutation checks that name the line and the test that fails.

## 4. Deferred

None.
