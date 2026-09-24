# Game Rules & Dictionary Validation Specification

> Resolves #1168

Documents DeWordle's exact game mechanics: letter feedback rules,
duplicate-letter edge cases, the secret-word commitment scheme, daily
round timing, and streak calculation. Grounded in the actual
implementation — `backend/src/dewordle/wordle.engine.ts` for guess
evaluation and `soroban/contracts/core_game/src/lib.rs` for on-chain
session/commitment/streak logic.

## Letter feedback rules

Each letter in a guess is evaluated against the solution and marked with
one of three statuses:

<!-- markdownlint-disable MD013 MD060 -->

| Status | Symbol | Meaning |
| --- | --- | --- |
| `correct` | 🟩 Green | Letter is in the solution, in this exact position. |
| `present` | 🟨 Yellow | Letter is in the solution, but in a different position. |
| `absent` | ⬜ Gray | Letter does not appear in the solution at all (or no more unmatched copies remain — see duplicate letters below). |

<!-- markdownlint-enable MD013 MD060 -->

Evaluation is a **two-pass algorithm** (`evaluateGuess` in
`wordle.engine.ts`), which matters for the duplicate-letter edge cases
below:

1. **First pass — exact matches.** Every position where the guess letter
   equals the solution letter at that position is marked `correct`, and
   that letter is removed from a per-letter "available count" pool
   (a frequency map of the solution's letters).
2. **Second pass — present matches.** For every remaining (not-yet-`correct`)
   position, if the guess letter still has an available count left in
   the pool, it's marked `present` and that count is decremented.
   Otherwise it's marked `absent`.

Running the `correct` pass first, and only then consuming remaining
counts for `present`, is what makes duplicate letters behave correctly.

### Duplicate letter edge cases

**Solution has two copies of a letter; the guess also has two copies, but
only one lands on the correct position.**

Solution `SPEED`, guess `EAGER`.

- Solution letter pool: `S:1, P:1, E:2, D:1`.
- Position 1 (`E` vs `S`): not exact. `E` has 2 available → `present`,
  pool `E` → 1.
- Position 2 (`A` vs `P`): not exact, `A` not in solution → `absent`.
- Position 3 (`G` vs `E`): not exact, `G` not in solution → `absent`.
- Position 4 (`E` vs `E`): exact → `correct`, pool `E` → 0.
- Position 5 (`R` vs `D`): not exact, `R` not in solution → `absent`.

Result: `E`(present) `A`(absent) `G`(absent) `E`(correct) `R`(absent) —
the *first* `E` is `present` (there was still one available in the
pool), and the second `E` is `correct` because it's an exact-position
match, correctly using up the solution's two `E`s without over-crediting
a third one that doesn't exist.

**Guess repeats a letter that appears only once in the solution, and
neither occurrence lands on that letter's correct position.**

Solution `CRANE`, guess `EATEN` — solution has exactly one `E`, at
position 5; the guess's two `E`s are at positions 1 and 4, so neither is
an exact-position match.

- Solution letter pool: `C:1, R:1, A:1, N:1, E:1`.
- First pass finds no exact matches at all for this guess (none of
  `EATEN`'s letters happen to line up with `CRANE`'s letters in the same
  position), so every position is evaluated in the second pass, in guess
  order.
- The **first** `E` encountered (position 1, left to right) consumes the
  sole available `E` from the pool → `present`.
- The **second** `E` (position 4) finds the pool already at 0 for `E` →
  `absent`.
- (The guess's `A` and `N` are each `present` too, since the solution has
  one of each and neither lands on its correct position either — this
  example isn't E-only, just illustrating the E/E pair specifically.)

This is the classic Wordle "only as many colored tiles as the solution
actually has copies of that letter" rule — a guess can never show more
`present`/`correct` tiles for a letter than that letter's count in the
solution, with priority given left-to-right and `correct` matches always
resolved before `present` ones.

### Example feedback matrix

Solution: `CRANE`

Each row shows one guess and the resulting status of each of its five
letters, left to right:

<!-- markdownlint-disable MD013 MD060 -->

| Guess | Position 1 | Position 2 | Position 3 | Position 4 | Position 5 |
| --- | --- | --- | --- | --- | --- |
| `CRATE` | C 🟩 correct | R 🟩 correct | A 🟩 correct | T ⬜ absent | E 🟩 correct |
| `TRACE` | T ⬜ absent | R 🟩 correct | A 🟩 correct | C 🟨 present | E 🟩 correct |
| `EERIE` | E ⬜ absent | E ⬜ absent | R 🟨 present | I ⬜ absent | E 🟩 correct |

<!-- markdownlint-enable MD013 MD060 -->

`EERIE` demonstrates the duplicate-letter rule from above: the solution
has exactly one `E` (at position 5), so only the guess's position-5 `E`
— the one that's an exact match — is `correct`; both earlier `E`s in the
guess find the pool already exhausted (the first pass already claimed
the solution's only `E` for position 5) and are marked `absent`, not
`present`.

## Secret word commitment scheme

The solution word is never submitted on-chain in plaintext, and never
returned by the API before a session finalizes:

- **Daily puzzle commitment**: an admin calls `set_day_config(day_id,
  puzzle_commitment, max_attempts, ...)`, where `puzzle_commitment` is a
  `BytesN<32>` hash committing to that day's solution word — the raw word
  itself is never written to contract storage.
- **Guess commitment**: each `submit_guess(player, session_id,
  guess_commitment, ...)` call takes a `BytesN<32>` `guess_commitment`
  rather than the raw guess text; an all-zero commitment
  (`BytesN::from_array(&env, &[0; 32])`) is explicitly rejected with
  `CoreGameError::InvalidCommitment`.
- **Actual letter-by-letter evaluation happens off-chain**, server-side,
  via `evaluateGuess()` in `wordle.engine.ts`, against the word stored by
  `backend/src/utils/word-seed.service.ts`. The chain records
  *commitments* (proof that a specific guess/solution was used, without
  revealing it up front) and the resulting per-guess outcome event
  (`guess_submitted` — see
  [`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md)); it does not
  itself run the Green/Yellow/Gray comparison.
- See `docs/architecture/threat-model.md` (landing in a separate PR,
  "Dictionary / answer leaks" section) for the dictionary/answer-leak
  threat this scheme is designed to mitigate, and its current gaps.

## Daily round timing

- `current_day_id(env) = timestamp / 86_400` — the ledger's Unix
  timestamp divided by seconds-per-day, giving a UTC calendar day number
  (`soroban/crates/dewordle-utils/src/lib.rs`). There is no timezone
  adjustment; "day" is always UTC.
- The rotation interval is configurable per contract instance via
  `set_rotate_schedule(schedule_secs)` (admin-only), defaulting to
  `86400` seconds (24 hours) if never set.
- Each day's puzzle is configured independently via `set_day_config`,
  keyed by `day_id` — there's no automatic "roll over to tomorrow's
  word" behavior; a day with no configured `DayConfig` simply has no
  active puzzle (`CoreGameError::DayNotFound`/`DayNotActive`).

## Attempts per session

- `max_attempts` is set per day via `set_day_config`, not hardcoded —
  but the codebase's own tests and fixtures consistently configure it to
  **6**, matching standard Wordle rules.
- A hard ceiling of `MAX_ATTEMPTS_LIMIT = 20` is enforced on-chain;
  `set_day_config` panics with `CoreGameError::InvalidMaxAttempts` if
  `max_attempts` is `0` or exceeds `20`.
- Once `session.attempts_used >= session.max_attempts`, further guesses
  are rejected with `CoreGameError::AttemptLimitReached`.

## Streak calculation

Implemented in `core_game`'s `update_streak` (called on session
finalization) and read via `get_streak`:

```text
if streak.last_day_played + 1 == today:
    streak.current += 1          # played yesterday, extend the streak
elif streak.last_day_played != today:
    streak.current = 1           # gap of 2+ days, or first play — reset
# else: already played today — current is left unchanged (no double-counting)

streak.max = max(streak.max, streak.current)
streak.last_day_played = today
```

- A streak only extends if the player's *previous* played day was
  exactly `today - 1`; any larger gap resets `current` to `1` rather than
  to `0` (the day just played still counts as the start of a new streak).
- `max` is a running high-water mark, independent of the current streak
  — it never decreases even after a streak resets.
- Playing multiple times within the same `day_id` does not extend or
  reset the streak a second time; only the first finalized session of a
  new day advances it.
- See ADR 0006 (`docs/adr/0006-soroban-storage-type-selection.md`,
  landing in a separate PR) for why streak data is stored as
  `persistent` storage rather than `instance` or `temporary`.
