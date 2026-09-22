## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues and are managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Implementation-ticket completion protocol

When `$implement` is used for a GitHub issue, complete this protocol after the implementation, tests, and review have succeeded:

1. Commit all completed work to the current branch.
2. Push the commit(s) to `origin`.
3. After the push succeeds, close the originating GitHub issue with a completion comment.
4. Identify open implementation issues that became unblocked when the issue closed.
5. Report those unblocked issues, then stop; do not start another ticket automatically.

Keep the originating issue open when acceptance criteria are incomplete, tests fail, substantive review findings remain unresolved, or the push fails. The issue may be closed only after all completion gates pass.
