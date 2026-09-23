# DeWordle Reward Point & Token Distribution Model

> Resolves #1170

Documents how reward points are calculated and distributed by the
`rewards` Soroban contract
(`soroban/contracts/rewards/src/lib.rs`), and proposes the streak
multiplier and payout cap design that isn't implemented on-chain yet.
Sections are explicitly marked **Implemented** or **Proposed** so this
doc doesn't overstate what the contract actually does today.

## Implemented: guess-count multiplier

`RewardsContract::get_multiplier(attempts)` returns a flat multiplier
tier based on how many guesses a player used to win:

| Guesses used | Multiplier |
| --- | --- |
| 1–3 | ×3 |
| 4–5 | ×2 |
| 6 | ×1 |

```text
multiplier(attempts) =
    3  if attempts <= 3
    2  if attempts <= 5
    1  otherwise
```

This rewards solving the word quickly: a 3-guess win earns 3× the base
points of a 6-guess win. `attempts` is a `u32` and the contract does not
itself clamp it to the 1–6 range used by the game UI — callers (the
backend, via `core_game`'s session state) are expected to only ever pass
a value the actual game allows.

## Implemented: base point accrual

Per-day base point values are set by the admin via `set_emission`, stored
as an `EmissionConfig`:

```rust
pub struct EmissionConfig {
    pub day_id: u32,
    pub win_points: u64,
    pub participation_points: u64,
}
```

- `win_points` — base points awarded for a win, **before** the
  guess-count multiplier above is applied.
- `participation_points` — flat points for playing that day's puzzle,
  regardless of outcome.

Points are actually credited to a player's balance via `accrue(player,
points, nonce, reason)`, which is nonce-guarded (an already-used
`(player, nonce)` pair panics with `RewardsError::InvalidNonce`) so the
same accrual can't be replayed twice — see ADR 0006
(`docs/adr/0006-soroban-storage-type-selection.md`, landing in a
separate PR) and `docs/troubleshooting/soroban-rpc-guide.md` (also
landing separately) for more on nonce handling generally. `accrue`
takes the final `points`
value as a parameter — i.e. **the guess-count multiplier is applied by
the caller before calling `accrue`**, not inside the contract itself. The
contract only enforces that points aren't double-credited; it does not
independently recompute or validate the multiplier math.

A player's full picture is available via `get_player_stats`, returning
`games_won`, `tokens_earned` (current balance + lifetime claimed), and
`rank`.

## Proposed: daily streak multiplier tiers

**Not yet implemented.** The `rewards` contract has no awareness of a
player's streak today — streak tracking (`PlayerStreak { current, max,
last_day_played }`) lives entirely in `core_game`
(`soroban/contracts/core_game/src/lib.rs`'s `get_streak`/`update_streak`),
and nothing currently reads it when accruing rewards.

Proposed formula, layered on top of the existing guess-count multiplier:

| Streak length (consecutive days) | Streak multiplier |
| --- | --- |
| 1–2 days | ×1.0 (no bonus) |
| 3–6 days | ×1.1 |
| 7–13 days | ×1.25 |
| 14–29 days | ×1.5 |
| 30+ days | ×2.0 |

```text
final_points = win_points * guess_multiplier(attempts) * streak_multiplier(streak.current)
```

Rationale for the tier boundaries: 3 days is enough to filter out casual
one-off wins, a week (7) and two weeks (14) align with the daily-puzzle
cadence players already track via `PlayerStreak`, and 30 days is
DeWordle's longest commonly-referenced "monthly" milestone. These
boundaries are a starting proposal, not a finalized/audited value — they
should be revisited with real playtest data before being wired into
`accrue`'s caller.

To implement this, the caller that currently computes
`win_points * guess_multiplier(attempts)` (today: the backend, calling
`accrue` with an already-final `points` value) would additionally read
`core_game::get_streak(player).current` and apply the table above before
calling `accrue`. No `rewards` contract changes are strictly required
for a first version, since `accrue` already accepts an arbitrary
`points` value — a future iteration could move the multiplier math
into the contract itself for tamper-resistance, at the cost of coupling
`rewards` to `core_game`'s storage layout.

## Proposed: daily payout cap & vault treasury distribution

**Not yet implemented.** There is currently no cap on how many points a
single player (or the system in aggregate) can accrue per day, and no
"vault"/treasury concept exists anywhere in the contracts — `accrue`
will credit any `points` value an authorized admin call supplies, with
no upper bound.

Proposed design:

- **Per-player daily cap**: cap `final_points` (after both multipliers
  above) at a fixed ceiling per player per `day_id`, e.g. equivalent to a
  30-day-streak, 1-guess win, so no single day's play can out-earn what a
  sustained streak is worth. This would require a new
  `DataKey::DailyAccrued(Address, u32 /* day_id */)` entry, checked and
  incremented inside `accrue` (or by its caller) before crediting.
- **Vault treasury**: introduce a `DataKey::Vault` balance that
  `set_emission`-configured points are drawn down from rather than
  minted unboundedly on every `accrue` call, so total in-circulation
  reward points are bounded by what's actually been funded into the
  vault — preventing an admin key compromise (see
  [docs/architecture/threat-model.md](../architecture/threat-model.md))
  from being able to mint an unbounded amount of value. `accrue` would
  need to check the vault balance and reject (or partially fill) an
  accrual that would exceed it.

Both of these are cross-cutting changes to `accrue`'s contract logic
(not just documentation), so they're recorded here as the proposed
target design rather than implemented in this PR.
