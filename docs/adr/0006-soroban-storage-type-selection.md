# ADR 0006: Soroban Storage Type Selection for Player Sessions & Streaks

## Status

Accepted

## Context

Soroban's `soroban_sdk::storage` API exposes three storage tiers, each with
different lifecycle, cost, and durability characteristics:

<!-- markdownlint-disable MD013 MD060 -->

| Storage Type | Lifecycle / TTL | Rent Cost | Ledger Extension Behavior |
| --- | --- | --- | --- |
| `temporary` | Expires automatically after its TTL elapses; **cannot be extended or restored** once expired — the entry is simply gone. | Lowest — cheapest write, no bump/extension cost to maintain. | Not extendable. Once the TTL is reached, the data is permanently deleted; a new write is required to recreate it. |
| `instance` | Tied to the contract instance's own TTL; extended whenever *any* instance-storage read/write touches it, or explicitly via `extend_ttl`. Archived (not deleted) if it expires, and can be restored by a keeper. | Higher relative to `persistent` per byte, since instance storage is loaded on every invocation regardless of which keys are touched — it scales with total instance state, not per-entry. | Extended contract-wide; a single `extend_ttl` call (or footprint bump) refreshes every key in instance storage together. Convenient for small, shared config, expensive to keep large amounts of unrelated data alive together. |
| `persistent` | Has its own independent TTL per entry; archived (not deleted) on expiry, and can be restored by paying to bump it back, or resurrected by a keeper within the archival window. | Lower per-key than `instance` for the same total bytes, since only the entries actually being touched are loaded/rent-charged. | Extended per-entry via `extend_ttl(key, ...)` — only the keys actually in use need their TTL refreshed, independent of other contract state. |

<!-- markdownlint-enable MD013 MD060 -->

`core_game` needs to keep two kinds of player-tied data alive across many
separate transactions, potentially over long, irregular intervals (a player
might not play for weeks and still expect their streak to resume
correctly):

- **Game sessions** (`DataKey::Session(BytesN<32>)`) — created when a
  session starts, read/written across several guess submissions, then
  read once more at finalization. Needed only for the duration of an
  active session (at most a few days), but must never silently disappear
  mid-session.
- **Player streaks** (`DataKey::Streak(Address)`) — must survive
  indefinitely across the player's entire history with the game, read and
  updated once per day the player plays, and must never expire while a
  streak is still active (an unexpected data loss here would silently
  reset a player's streak, which is a player-visible correctness bug, not
  just a cost/performance concern).

## Decision

Use **`persistent` storage** for both `Session` and `Streak` data (already
the implementation in `soroban/contracts/core_game/src/lib.rs`, and
consistent with [ADR 0004](./0004-contract-storage-model.md)), rather than
`instance` or `temporary` storage. Specifically:

1. **Reject `temporary` storage** for both. A `temporary` entry that
   expires is gone for good — there is no archival/restore path. For a
   session, that would mean a player mid-guess could lose their entire
   session state outright. For a streak, an expired entry would be
   indistinguishable from "no streak" and silently reset the player's
   progress to zero — an unacceptable, unrecoverable correctness failure
   for data that's meant to represent a player's long-term standing.

2. **Reject `instance` storage** for both. Instance storage's TTL is
   shared across the *entire* contract instance — every session and every
   player's streak would be bundled into one TTL, so extending it to keep
   one active player's data alive means paying to extend all of it,
   including sessions/streaks for players who haven't touched the
   contract recently. This doesn't scale as the player base grows, and
   couples unrelated players' storage costs together. `instance` storage
   remains reserved for genuinely global, small, shared config (admin
   addresses, pause flag — see ADR 0004), where that shared-TTL trade-off
   is actually the point.

3. **Use `persistent` storage**, keyed per-entity
   (`DataKey::Session(session_id)` / `DataKey::Streak(player)`), so each
   session's and each player's TTL is independent:
   - A session's TTL only needs to be extended while that specific session
     is active, and can be left to expire (then archived, not deleted)
     once finalized — no ongoing cost for completed sessions.
   - A streak's TTL is extended each time `update_streak` runs (i.e. each
     day the player plays), which naturally keeps an *active* streak
     alive without any extra bookkeeping, while an inactive player's
     streak entry simply isn't touched — its rent cost doesn't compete
     with active players' entries the way it would under a shared
     `instance` TTL.
   - If a streak entry's TTL does lapse (a player away long enough that
     the entry archives), `persistent` storage's archive-and-restore
     model means the data can still be recovered by a keeper/restore
     rather than being unrecoverably deleted, unlike `temporary`.

## Consequences

- Session and streak rent costs scale with the number of *active*
  players/sessions, not with total instance state — this is the storage
  tier whose cost model actually matches the access pattern.
- A returning player's streak is never silently lost to a hard expiry the
  way it would be under `temporary` storage; worst case it's archived and
  recoverable, not deleted.
- Extending TTLs is a per-entity operation, so keeping one player's
  session/streak alive never requires paying to extend unrelated players'
  data, unlike the shared TTL `instance` storage would impose.
- This formalizes (rather than changes) the storage tier already used in
  `core_game`'s `get_streak`/`update_streak`/`get_session_internal`
  implementations — see [ADR 0004](./0004-contract-storage-model.md) for
  the full storage-key inventory across all four contracts.

## Migration Notes

- No contract changes required — this ADR documents and justifies the
  storage tier already in production use for sessions and streaks.
- Future contracts adding player-tied data with a similar
  "long-lived, per-entity, must-not-silently-disappear" shape should
  default to `persistent` storage for the same reasons, reserving
  `instance` for genuinely global config and `temporary` for data that's
  truly disposable within a single transaction.
