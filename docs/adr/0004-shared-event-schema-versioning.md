# ADR 0004: Shared Event Schema Versioning

## Status

Accepted

## Context

Event schemas describing the shape of on-chain events (topics + payload
fields) are shared across three consumers that must all agree on the
wire format: the Soroban contracts that emit events (`core_game`,
`rewards`, `achievements`, `admin_registry`), the backend indexer that
normalizes and persists them
(`backend/src/indexer/processors/event-normalizer.service.ts`), and the
frontend SDK that reads them. The single source of truth for the shape
is `shared/events/schemas.ts`'s `EVENT_SCHEMAS` array — see
[`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md) for the
consumer-facing documentation of these same schemas.

Without a formal versioning strategy, a contract-side field rename or
type change could silently desync from what the indexer expects to
parse, or what the frontend expects to render — exactly the kind of
RPC/event-shape validation risk `docs/architecture/threat-model.md`
(landing in a separate PR) is concerned with.

## Decision

### Two-tier version numbers

`shared/events/schemas.ts` already carries two version numbers, which
this ADR formalizes the meaning of:

1. **`SCHEMA_VERSION`** (currently `2`) — a single integer for the
   *whole schema file*. Bump this whenever **any** schema in the file
   has a breaking change (see below). Consumers can use this as a
   coarse-grained "am I even looking at a compatible schema file"
   check.
2. **Per-event `version`** (each `EventSchema.version`, currently `2`
   for every event) — an integer per individual event topic. Bump only
   the specific event(s) that actually changed, not every event in the
   file, so a consumer only needs to care about the version of the
   specific topics it subscribes to.

### Backwards-compatibility rules

A change to an event schema is classified as one of:

- **Additive (non-breaking, no version bump required)**: adding a new
  *optional* field (`required: false` or omitted) to `topicFields` or
  `payloadFields`. Existing consumers that don't know about the new
  field simply ignore it; this is safe to ship without coordinating a
  version bump across all three consumers simultaneously.
- **Breaking (requires bumping both the event's `version` and the file's
  `SCHEMA_VERSION`)**:
  - Removing a field (topic or payload) that any consumer currently
    reads.
  - Changing a field's `type` (e.g. `u32` → `u64`, `Symbol` → `BytesN<32>`).
  - Adding a *required* field, since existing on-chain data / already-
    deployed contracts won't have it.
  - Renaming a field (equivalent to remove + add from a consumer's
    perspective).
- **New event topic**: not breaking on its own (existing consumers that
  don't subscribe to the new topic are unaffected), but the new
  `EventSchema` entry must itself start at a sensible `version` (`1` if
  it's genuinely new, matching an existing related event's version if
  it's a variant/split of one).

### Contract-side compatibility

Since Soroban contract events are permanent, immutable on-chain history
once emitted, a breaking schema change can **never** be applied
retroactively to already-emitted events — old events on-chain will
always have the old shape. This means:

- The indexer's normalizer must remain able to parse **both** the old
  and new shape for some transition period after a breaking change
  ships, keyed on the per-event `version` it observes in (or infers
  from) the raw event — not just parse whatever the current
  `schemas.ts` says.
- A breaking contract-side change should be treated the same way a new
  contract deployment/migration would be (see
  [ADR 0001](./0001-soroban-foundation-boundaries.md)), not as a
  same-day schema file edit.

## Consequences

- Consumers can distinguish "the schema file as a whole changed"
  (`SCHEMA_VERSION`) from "this specific event I care about changed"
  (per-event `version`), avoiding unnecessary coordination for changes
  to unrelated events.
- Additive changes (the common case — a new optional field for a new
  feature) ship without a version bump, keeping day-to-day schema
  evolution lightweight.
- Breaking changes are rare by design, and require explicit,
  intentional version bumps rather than being silently absorbed.

### Known gap: the compatibility check doesn't diff against a baseline

`scripts/check-event-schemas.ts` (run by the `Event Compatibility Check`
CI workflow) exists and is intended to enforce the rules above
automatically, but as currently written it only diffs the current
schema snapshot **against itself** — it filters `snapshot.schemas` by
excluding each schema's own topic, which can never actually detect a
field removal or type change relative to a previous commit.
`hasBreakingChanges()` is consequently always `false` today, and the
check always passes regardless of whether a breaking change was made.
Implementing real detection (diffing against the schema file's state at
the PR's base commit, or a checked-in baseline snapshot) is required
before this ADR's rules are actually machine-enforced rather than just
documented convention — tracked as follow-up work, not fixed in this
PR since it's a behavioral script change, not documentation.

## Migration Notes

- No schema changes required — this ADR documents the versioning
  convention `SCHEMA_VERSION`/per-event `version` were already added
  for, and records the compatibility rules that should govern future
  changes to `shared/events/schemas.ts`.
- See [`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md) for the
  current schema contents, and the "Known gap" section above for the
  compatibility-check tooling that still needs to be implemented for
  real enforcement.
