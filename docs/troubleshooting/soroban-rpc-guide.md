# Local Soroban RPC Proxy Troubleshooting Guide

> Resolves #1162

Common issues encountered when running the local Soroban RPC container
(`dewordle-soroban-rpc`, defined in `docker-compose.yml`) and funding
accounts with Friendbot during local development. Each item follows a
**Problem → Root Cause → Solution** format.

For general local-dev setup (prerequisites, build commands, environment
variables), see [`docs/SOROBAN_LOCAL_DEV.md`](../SOROBAN_LOCAL_DEV.md).

## Diagnostics: checking RPC container health

Run these first — most of the issues below start with one of these commands
coming back unhealthy.

```bash
# Is the container running at all?
docker ps --filter name=dewordle-soroban-rpc

# Container-level health/status and recent logs
docker inspect --format '{{.State.Health.Status}}' dewordle-soroban-rpc
docker logs --tail 100 dewordle-soroban-rpc

# Is the RPC endpoint actually answering?
curl -s http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .

# Is the container's own ledger progressing? (compare two calls a few seconds apart)
curl -s http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq .sequence

# Is Friendbot reachable? (bundled with the stellar/quickstart image on :8000)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/friendbot
```

A healthy container returns `"status":"healthy"` from `getHealth` and a
`sequence` number from `getLatestLedger` that increases between calls.

---

## 1. RPC connection timeouts

**Problem**: `stellar contract invoke`, the indexer's poll cycle
(`backend/src/indexer/indexer.service.ts`), or the frontend hang or fail
with a connection timeout when talking to `http://localhost:8000/soroban/rpc`.

**Root cause**: Most often one of:
- The `soroban-rpc` container is still starting up — `stellar/quickstart`
  needs to initialize a standalone network on first boot, which can take
  30–60s.
- The container exited or was never started (`docker compose up` wasn't run,
  or a previous run crashed).
- `SOROBAN_RPC_URL` in your `.env` doesn't match the port mapped in
  `docker-compose.yml` (`8000:8000` by default).

**Solution**:
```bash
# Confirm the container is up and check its logs for startup errors
docker ps --filter name=dewordle-soroban-rpc
docker logs --tail 50 dewordle-soroban-rpc

# If it's not running, (re)start it
docker compose up -d soroban-rpc

# Verify the endpoint responds once it's up
curl -s http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .

# If it's slow rather than down, raise the client timeout rather than
# treating it as a hard failure
export STELLAR_RPC_TIMEOUT=30000
```

If the container keeps restarting, check `docker inspect
dewordle-soroban-rpc` for an OOM kill — the quickstart image needs at
least ~2GB of RAM available to Docker.

## 2. Nonce mismatches

**Problem**: A transaction is rejected with an error like `"txBadSeq"` or
`"sequence number mismatch"` when submitting a guess or invoking a
contract method.

**Root cause**: Every Stellar account has a sequence number ("nonce") that
must be exactly `current_sequence + 1` for the next submitted transaction.
This gets out of sync when:
- Two transactions are built from the same account concurrently (e.g. a
  retry fired while the original request was still in flight).
- A transaction was built against an account's sequence number, but a
  *different* transaction from that account was submitted and confirmed
  first.
- The local standalone network was restarted/reset (`docker compose down
  -v`) without refetching the account's current sequence number, so a
  stale cached value is being reused.

**Solution**:
```bash
# Re-fetch the account's current sequence number directly from RPC rather
# than trusting a cached value
curl -s http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"getAccount",
    "params":{"address":"<PUBLIC_KEY>"}
  }' | jq .result.sequence

# Or with the CLI
stellar account get <PUBLIC_KEY> --network local
```
Rebuild the failing transaction using that fresh sequence number. If this
happens repeatedly under concurrent load, ensure transaction-building code
serializes per-account (don't build two transactions from the same source
account before the first has been submitted), and never cache a fetched
sequence number across more than one submission.

## 3. Friendbot rate limits

**Problem**: Funding a new local/testnet account via Friendbot returns
`429 Too Many Requests`, or the response body includes an error mentioning
rate limiting.

**Root cause**: Friendbot throttles funding requests per source IP (and,
on public testnet, sometimes per destination account) to prevent abuse.
This is most commonly hit when a test suite or seed script funds many
fresh keypairs in a tight loop.

**Solution**:
```bash
# Check what Friendbot is actually returning
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:8000/friendbot?addr=<PUBLIC_KEY>"
```
- **Locally**: the standalone quickstart network's own Friendbot is much
  more permissive than testnet's, but is still rate-limited per process —
  space out funding calls (e.g. a short sleep) instead of firing them all
  concurrently, or fund one shared account and use `stellar keys fund
  --from-key <FUNDED_KEY>`-style transfers to seed the rest.
- **Against public testnet**: back off and retry with exponential delay
  rather than retrying immediately; reuse already-funded keypairs across
  test runs (persist them) instead of generating and funding a new one on
  every run.
- If you're funding many accounts in CI, batch the funding step once per
  test session rather than per test case.
