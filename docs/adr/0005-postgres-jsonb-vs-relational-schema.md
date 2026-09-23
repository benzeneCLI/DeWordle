# ADR 0005: PostgreSQL JSONB vs Relational Schema for Game Sessions

## Status

Accepted

## Context

Guess attempt histories need to be persisted for every game session:
which word was guessed, on which attempt, and the resulting per-letter
feedback (`correct`/`present`/`absent` for each of the 5 letters — see
[`docs/gameplay/game-rules.md`](../gameplay/game-rules.md)).

Two schema approaches were available:

1. **Fully relational**: a `guess_history` row per guess, plus a further
   child table (e.g. `guess_letter_result`) with one row per letter
   position, each carrying `session_id`, `attempt_number`, `position`,
   `letter`, and `status`.
2. **JSONB**: a `guess_history` row per guess, with the per-letter
   feedback stored as a single JSONB array column on that row.

The actual implementation
(`backend/src/game-sessions/entities/guess-history.entity.ts` and
`game-session.entity.ts`) uses a **hybrid** of the two, not purely
either — this ADR documents and justifies that hybrid.

## Decision

### Normalized child table for guesses themselves

Each guess is its own row in `guess_history` (a `@OneToMany` from
`GameSession`), with `session`, `guess`, `attemptNumber`, and
`createdAt` as real, individually-queryable/indexable columns — not
folded into a JSON blob on the parent session row. `(session,
attemptNumber)` has a unique index, since attempt numbers must not
collide within a session.

**Rationale**: Guesses are naturally queried and joined *by attempt* —
"give me attempt 3 of this session", "how many attempts has this
session used", pagination over a session's guess history. A relational
child table gives correct, indexable, cheap-to-query semantics for all
of that, and TypeORM's `@OneToMany`/cascade insert maps directly onto
it. Folding every guess into one JSON array on the session row would
mean loading and re-serializing the *entire* history to append a single
new guess, and would make "attempt N" lookups a JSON-path query instead
of an indexed row lookup.

### JSONB for per-letter feedback within a guess

Each `guess_history` row's `result` column is `jsonb`, holding the array
of `{ letter, status }` objects for that one guess's five letters,
rather than a further normalized `guess_letter_result` child table with
one row per letter.

**Rationale**:

- **Query pattern**: the per-letter result is always read and written as
  a single, complete unit — one guess's full feedback is computed
  together (`evaluateGuess()` in `wordle.engine.ts`, see
  [`docs/gameplay/game-rules.md`](../gameplay/game-rules.md)), returned
  to the client together, and never queried "give me all guesses where
  letter 3 was `correct`" style, across sessions. There's no query
  pattern today that benefits from the letters being separate rows.
- **Fixed, small shape**: the array is always exactly `word_length`
  entries (5 today), each a small fixed-shape object. This is exactly
  the case JSONB is a good fit for — a small, self-contained, always-
  read/written-as-a-whole payload — versus the case it's a poor fit for
  (a large or frequently-partially-queried collection).
- **Write simplicity**: one `INSERT` per guess with the result embedded,
  instead of one `INSERT` for the guess row plus five more for its
  letters (or a single multi-row insert) on every single guess
  submission — meaningfully fewer round trips on the hottest write path
  in the game.
- **GIN indexing was not needed, so none was added.** JSONB's main
  performance advantage over `json` is GIN-indexable containment/path
  queries (`@>`, `->>` with an index) — but since `result` is never
  filtered or searched by its contents (only ever read back whole for
  a known guess row), there's currently no GIN index on it, and adding
  one today would be pure overhead with no query it speeds up. If a
  future feature needs to query by letter outcome (e.g. "find all
  sessions where the player got a green on their first guess" for an
  achievement), that's the point to add a GIN index on `result`, or
  reconsider normalizing that specific access pattern out into its own
  table.

### `GameSession.metadata` as a loosely-typed JSON escape hatch

`GameSession` also has a `metadata: Record<string, any>` (`json`, not
`jsonb`) column — an intentionally loose, schema-less bucket for
session-level data that doesn't yet have a stable enough shape to
justify its own column(s) (e.g. experimental fields added during
development). This is a deliberately different trade-off than
`result`: `json` (not `jsonb`) is used here because this column is
genuinely read/written as an opaque blob with no query needs at all,
and `json` preserves exact input formatting/whitespace and is
marginally cheaper to write than `jsonb`'s parsed/binary form — a
reasonable choice when no querying or indexing is ever expected.

## Consequences

- Attempt-level queries (pagination, "how many guesses so far",
  attempt-uniqueness enforcement) are fast, indexed, and simple —
  they're ordinary relational queries against real columns.
- Per-guess writes are a single row insert with the full letter-result
  payload attached, keeping the guess-submission write path simple and
  low-latency.
- Querying *across* guesses by individual letter outcome (e.g. "all
  guesses where position 3 was correct") would currently require a
  JSONB path query without a supporting index — acceptable today since
  no such query exists, but worth revisiting (adding a GIN index, or
  extracting a normalized table) if that access pattern is ever needed.
- The schema correctly reflects the actual access pattern: relational
  where rows are independently queried (guesses), JSONB where a payload
  is always read/written as an atomic unit (per-guess letter feedback),
  rather than dogmatically picking one style for the whole schema.

## Migration Notes

- No schema changes required — this ADR documents and justifies the
  schema already in place
  (`backend/src/migrations/1753519314008-CreateGuessHistory.ts` and
  related migrations).
- If a future feature needs to query `result` by content, add a GIN
  index via a new migration (`CREATE INDEX ... USING GIN (result)`)
  rather than assuming one already exists.
