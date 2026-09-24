# Privacy Policy & Data Collection Transparency

> Resolves #1178

This document discloses what data DeWordle's backend indexer, API, and
player analytics services process, and affirms what they deliberately do
not collect. It reflects the current implementation — see the source
references under each section for where a given behavior lives in code.

## Summary

DeWordle does not collect personal identity information (PII). The only
identifier tied to gameplay is a player's **public wallet address**, which
is a pseudonymous on-chain identifier by design, not personal data.

## What is processed

### Public wallet addresses

- Used as the primary key for game sessions, guesses, streaks, and
  leaderboard standings (`backend/src/game-sessions`,
  `backend/src/leaderboard`).
- Sourced from the Soroban contract events the indexer ingests
  (`backend/src/indexer/indexer.service.ts`) — i.e. from data the player
  already published on-chain by transacting, not collected out-of-band by
  DeWordle.
- A wallet address is public by construction on the Stellar network; it is
  not linked to a real-world identity by DeWordle.

### IP addresses — rate limiting only

- IP addresses are read from the request (`req.ip`, falling back to the
  `x-forwarded-for` header) solely to key **rate limiters** that protect
  the API from abuse — see `backend/src/common/rate-limit.guard.ts` and
  `backend/src/leaderboard/leaderboard-rate-limit.guard.ts`.
- Where a wallet address is already known for the request, the rate
  limiter keys on that instead of the IP (`WalletRateLimitGuard`); IP is
  only the fallback for unauthenticated requests.
- Request counts are held **in-memory, per rate-limit window** (e.g. a
  60-second sliding window) and are not persisted to the database or
  written to any long-term store. Once a window resets, the association
  between an IP and its request count is gone.
- IP addresses are not logged alongside wallet addresses, guesses, or any
  other gameplay data.

### Browser cookies

DeWordle's frontend does not currently set any cookies — session and
wallet-connection state are held client-side (wallet adapter state), not
in a cookie jar. If a future feature introduces cookies (e.g. for session
persistence), this document will be updated before that ships, and any
such cookie will be scoped to what's strictly necessary for the app to
function (no third-party tracking or advertising cookies).

## What is explicitly not collected

DeWordle's backend and indexer do **not** collect or store:

- Names, email addresses, phone numbers, or other real-world identity
  data.
- Browser fingerprints, device identifiers, or analytics SDKs (no
  third-party analytics, no ad tracking pixels).
- Precise geolocation.
- Any data that could deanonymize a wallet address to a real person.

## On-chain data

All gameplay events (guesses, session outcomes, streaks) are emitted by
the `core_game` Soroban contract and are public on-chain data by the
nature of a public blockchain — see
[`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md) for the event
payload shapes the indexer consumes. DeWordle's backend is a read-through
cache and query layer over this already-public data; it does not add any
private data to what's already visible on-chain.

## Questions

If you have questions about this policy or believe DeWordle is processing
data inconsistently with what's described here, please open an issue in
this repository.
