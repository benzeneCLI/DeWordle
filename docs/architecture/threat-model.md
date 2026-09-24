# Threat Model & Attack Surface

> Resolves #1172

Threat model for DeWordle's smart contracts, indexer, and backend API,
organized using [STRIDE](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats#stride-model)
(Spoofing, Tampering, Repudiation, Information Disclosure, Denial of
Service, Elevation of Privilege). Each entry records whether a mitigation
is implemented today, with the file it lives in, or still a
recommendation.

For the broader system layout referenced throughout, see
`docs/architecture/c4-model.md` (landing in a separate PR).

## Smart contracts (Soroban)

### Reentrancy

**Risk**: A malicious contract called mid-invocation re-enters a DeWordle
contract before its first invocation's state update completes, allowing
double-spend-style exploits (e.g. re-entering `accrue` before a balance
update lands).

**Mitigation — Implemented**: Soroban's execution model doesn't allow the
classic EVM-style reentrancy pattern (no arbitrary external calls with
control handed back mid-function before storage writes complete within a
single host invocation), and none of DeWordle's contracts (`core_game`,
`rewards`, `achievements`, `admin_registry`) call out to other, unaudited
contracts mid-mutation. State is read, mutated, and written back to
storage before any cross-contract call, where cross-contract calls exist
at all.

### Replay attacks (transaction / event replay)

**Risk**: A previously-valid signed transaction or contract event is
resubmitted/redelivered to double-credit rewards, double-count a win, or
re-process an already-ingested indexer event.

**Mitigation — Implemented**:

- **On-chain**: `rewards`' `accrue`, `claim`, and `record_win` all check a
  `DataKey::Nonce(player, nonce)` entry before mutating state and panic
  with `RewardsError::InvalidNonce` on reuse
  (`soroban/contracts/rewards/src/lib.rs`). `core_game` uses the
  equivalent `SessionNonce(Address, u32)` pattern.
- **Off-chain (indexer)**: `EventDedupService` checks a TTL-windowed
  dedup key (`txHash` + `eventIndex`) before processing an event, since
  Soroban RPC can redeliver the same event across a reconnect
  (`backend/src/indexer/indexer.service.ts`'s `ingest()`).

### Dictionary / answer leaks

**Risk**: The daily word (answer) is exposed to the client before a
session is finalized, letting a player inspect network traffic or
frontend state to see the answer ahead of guessing it correctly.

**Mitigation — Implemented (backend-enforced)**: Guess validation is
computed server-side (`backend/src/dewordle/wordle.engine.ts`) against
the word stored via `backend/src/utils/word-seed.service.ts`; the answer
itself is not expected to be included in any response returned to the
client prior to the session finalizing.

**Gap / recommendation**: This document doesn't independently verify that
*every* current and future API response shape excludes the answer field
before finalization — add an explicit response-shape test asserting the
raw answer is absent from `GET`/guess-submission payloads for an
in-progress session, so a future endpoint can't regress this silently.

### RPC spoofing / malformed RPC responses

**Risk**: A compromised or misconfigured RPC endpoint returns malformed,
incomplete, or maliciously-crafted event data that the indexer trusts
and persists as if it were genuine on-chain state.

**Mitigation — Implemented**: `validateRpcResponseShape` and
`diagnoseMalformedEvent`
(`backend/src/indexer/processors/rpc-response.validator.ts`) validate the
JSON-RPC envelope and individual event shape before any event is
normalized or persisted; structurally invalid events are logged and
dropped rather than ingested (`indexer.service.ts`'s `poll()`). See also
`docs/troubleshooting/soroban-rpc-guide.md` (landing in a separate PR)
for operational RPC connectivity issues (a related but distinct concern
from malicious/malformed data).

**Gap / recommendation**: The indexer trusts whichever `SOROBAN_RPC_URL`
it's configured with — there's no pinning/verification that the RPC
endpoint is the one actually expected (e.g. via a known network
passphrase check against the response, or TLS certificate pinning for a
hosted RPC provider). Worth adding for production mainnet deployments
where the RPC endpoint isn't a locally-controlled container.

## Backend API / indexer

### Denial of Service (DDoS / abuse)

**Risk**: A flood of requests to the public API (guess submission,
leaderboard reads) degrades service for legitimate players, or exhausts
backend/database resources.

**Mitigation — Implemented**: Rate limiting keyed on wallet address
(falling back to IP) via `WalletRateLimitGuard`
(`backend/src/common/rate-limit.guard.ts`), and a separate fixed-window
IP-based limiter for the leaderboard endpoint
(`LeaderboardRateLimitGuard`,
`backend/src/leaderboard/leaderboard-rate-limit.guard.ts`). See
`docs/privacy/privacy-policy.md` (landing in a separate PR) for how
these IPs are handled (in-memory only, not persisted).

**Gap / recommendation**: Both rate limiters currently hold counters
in-memory per process — in a multi-instance backend deployment, an
attacker distributing requests across instances could exceed the
intended aggregate limit. A shared Redis-backed counter (Redis is
already a dependency — see `docs/architecture/c4-model.md`, landing in
a separate PR) would close this gap.

### Elevation of privilege (admin-gated operations)

**Risk**: A non-admin caller invokes an admin-only contract method
(`set_emission`, `accrue`, `record_win`, `pause`, etc.), or forges
authorization for one.

**Mitigation — Implemented**: Every admin-only method calls
`require_admin(&env)` (`dewordle_auth` crate, used across
`core_game`/`rewards`) before mutating state, which relies on Soroban's
native `Address.require_auth()` — the caller must supply a valid
signature for the address stored as `DataKey::Admin`, not just claim to
be that address.

### Information disclosure (sensitive data in logs/errors)

**Risk**: Wallet addresses or other sensitive-looking data end up in
plaintext logs or error responses.

**Mitigation — Implemented**: `sanitizeErrorMessage` and
`sanitizeLogPayload` (`backend/src/common/redaction.ts`) redact
wallet-address-shaped strings and email-shaped strings before they reach
logs.

### Repudiation (unauthenticated/unattributed actions)

**Risk**: An action (a reward accrual, a rank change) can't be tied back
to who authorized it, making it hard to audit after the fact.

**Mitigation — Implemented**: Every state-changing contract call is a
signed Stellar transaction recorded permanently on-chain and emits a
typed event (see
[`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md)) carrying the
relevant `Address`, giving a complete, tamper-evident audit trail by
construction — this is a property of the underlying blockchain, not
something DeWordle has to separately implement.

## Summary

<!-- markdownlint-disable MD013 -->

| Threat (STRIDE) | Area | Status |
| --- | --- | --- |
| Tampering — reentrancy | Contracts | Implemented (by execution model) |
| Repudiation — event/tx replay | Contracts + indexer | Implemented (nonce + dedup) |
| Information disclosure — dictionary leak | Backend | Implemented, gap: no regression test |
| Spoofing — RPC spoofing | Indexer | Implemented, gap: no endpoint pinning |
| Denial of service — API abuse | Backend | Implemented, gap: per-process only |
| Elevation of privilege — admin ops | Contracts | Implemented |
| Information disclosure — logs | Backend | Implemented |
| Repudiation — action attribution | Contracts | Implemented (on-chain by design) |

<!-- markdownlint-enable MD013 -->
