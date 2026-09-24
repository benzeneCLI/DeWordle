# Redis Memory Eviction Policy & Monitoring

Resolves #1154.

## Current usage

Redis is used for (see [`docs/architecture/c4-model.md`](../../docs/architecture/c4-model.md)):

- **Indexer event dedup cache** — `EventDedupService`
  (`backend/src/indexer/dedup/event-dedup.service.ts`) writes a key per
  ingested event with an explicit TTL (`SET key 1 EX ttlSeconds`,
  currently 24 hours) to detect RPC-redelivered events. Every key this
  service writes has a TTL.
- **Job queue** — `backend/src/common/job.module.ts`.
- **Health checks** — a simple `PING` liveness check
  (`backend/src/health/redis-health.indicator.ts`).

None of the current usage requires a key to survive indefinitely without
a TTL — the closest to "persistent" state is job queue data, which is
itself meant to be drained/consumed, not permanently retained.

## Eviction policy: `volatile-lru`

`docker-compose.redis.yml`'s Redis service now runs with
`--maxmemory-policy volatile-lru` (previously `allkeys-lru`).

**Problem with `allkeys-lru`**: it evicts the least-recently-used key
across *all* keys in the keyspace once `maxmemory` is reached —
including any key that was written without a TTL. If a future feature
ever stores session state (or anything else meant to be durable) in
Redis without setting an explicit TTL, `allkeys-lru` would silently
evict it under memory pressure exactly like a disposable dedup-cache
entry, with no warning.

**Why `volatile-lru`**: it only considers keys that *have* a TTL set as
eviction candidates. Since every key DeWordle's current services write
already carries a TTL (dedup cache) or is expected to be short-lived
(queue jobs), this changes nothing about today's actual behavior — but
it means a future accidental "write persistent data to Redis with no
TTL" mistake fails loudly (Redis refuses to evict it, so `maxmemory`
being hit instead surfaces as write errors / `OOM command not allowed`
rather than silently losing the data) instead of being silently evicted
as if it were disposable cache data.

**Requirement this policy depends on**: every key written to Redis
*must* have an explicit TTL (`EX`/`PX`/`EXPIRE`), or `volatile-lru` has
nothing eligible to evict once memory fills up, and writes will start
failing outright instead of gracefully evicting. `EventDedupService`
already satisfies this; keep it true for any future Redis usage too.

## Alert threshold: memory usage > 85%

```yaml
groups:
  - name: dewordle-redis
    rules:
      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage above 85%"
          description: >-
            Redis is at {{ $value | humanizePercentage }} of maxmemory
            ({{ $labels.instance }}). With volatile-lru, sustained
            pressure here means TTL'd keys are being evicted early —
            check dedup TTL / queue backlog, not just maxmemory.
```

Matches the alert-rule documentation format used in
[`docs/METRICS_ALERTING.md`](../../docs/METRICS_ALERTING.md).

**Implementation note**: this rule isn't wired into a live
`rule_files` include in [`infra/prometheus/prometheus.yml`](../prometheus/prometheus.yml)
yet, and `redis_memory_used_bytes`/`redis_memory_max_bytes` require a
`redis_exporter` scrape target
(neither `infra/prometheus/prometheus.yml` nor
`docker-compose.redis.yml` currently run one) — consistent with how the
other rules in `docs/METRICS_ALERTING.md` are documented conventions
rather than already-deployed config. Adding the `redis_exporter`
service and wiring this rule file in is tracked as follow-up
infrastructure work, not done in this PR.
