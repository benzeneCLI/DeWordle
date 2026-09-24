# Release Notes Template

> Resolves #1175

Standard format for publishing DeWordle milestone/Wave progress reports.
Copy this file (or the filled example below) to
`docs/wave/releases/<milestone>-release-notes.md` when preparing a release
note, and fill in each section.

## Guidelines

- **Scope each note to one milestone/Wave.** Don't roll multiple waves
  into a single note — link back to the previous wave's note instead.
- **Link resolved GitHub issues.** Every bullet under Features Added, Bug
  Fixes, and Breaking Changes should reference the issue and/or PR that
  resolved it, e.g. `Add C4 architecture diagram (#1180, PR #1386)`. This
  keeps the note auditable and gives contributors credit traceably.
- **Omit empty sections rather than leaving them blank** — if a milestone
  had no breaking changes, drop that heading entirely rather than writing
  "None".
- **Performance Benchmarks** should compare against the previous
  milestone's numbers where available, not just report absolute figures,
  so regressions and improvements are visible at a glance.
- **Contributor Credits** lists GitHub handles, not just names, so readers
  can click through to their profile.

## Template

```markdown
# <Milestone/Wave Name> Release Notes

**Release date:** <YYYY-MM-DD>
**Milestone:** <link to GitHub milestone>

## Features Added

- <Feature summary> (#<issue>, PR #<pr>)
- <Feature summary> (#<issue>, PR #<pr>)

## Performance Benchmarks

| Metric | Previous | This Release | Change |
|---|---|---|---|
| <e.g. API p95 latency> | <value> | <value> | <+/-%> |
| <e.g. Indexer poll-to-persist lag> | <value> | <value> | <+/-%> |

## Bug Fixes

- <Bug summary> (#<issue>, PR #<pr>)

## Breaking Changes

- <What changed, and what consumers need to do about it> (#<issue>, PR #<pr>)

## Contributor Credits

- @<github-handle>
- @<github-handle>
```

## Example: filled release note

```markdown
# Wave 5 Milestone 3 Release Notes

**Release date:** 2026-09-23
**Milestone:** https://github.com/kike-alt/DeWordle/milestone/5

## Features Added

- Added Soroban RPC local troubleshooting guide covering connection
  timeouts, nonce mismatches, and Friendbot rate limits (#1162, PR #1385)
- Added Mermaid sequence diagram for the game guess submission flow,
  covering RPC polling, database writes, and WebSocket broadcast
  (#1163, PR #1385)
- Added C4 model system context and container architecture diagram
  (#1180, PR #1386)
- Added privacy policy disclosing telemetry/data handling for wallet
  addresses, IP-based rate limiting, and cookies (#1178, PR #1386)

## Performance Benchmarks

| Metric | Previous | This Release | Change |
|---|---|---|---|
| Indexer poll cycle duration (p95) | 420ms | 380ms | -9.5% |
| API `/leaderboard` response time (p95) | 145ms | 140ms | -3.4% |

## Bug Fixes

- Fixed markdown lint violations in newly added architecture docs
  (PR #1386)

## Contributor Credits

- @bobaivigitalpoint-ui
- @BigBen-7
```
