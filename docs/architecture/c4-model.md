# C4 Model: System Context & Container Architecture

> Resolves #1180

High-level architecture of DeWordle using the [C4 model](https://c4model.com/)'s
System Context and Container levels, rendered as Mermaid diagrams. For the
detailed request-level flow through these containers, see
`docs/architecture/sequence-diagrams.md` (landing in a separate PR).

## Level 1: System Context

Who uses DeWordle, and what external systems does it depend on?

```mermaid
flowchart TB
    Player(["Player"])
    Devkit(["Contributor / DevKit user"])

    subgraph System["DeWordle"]
        DeWordleSystem["DeWordle Wordle-style game on Stellar"]
    end

    StellarNetwork["Stellar Network<br/>(Testnet / Mainnet / Local standalone)"]
    Wallet["Player's Stellar wallet<br/>(Freighter, etc.)"]

    Player -->|Plays daily word game, submits guesses| DeWordleSystem
    Player -->|Approves transactions| Wallet
    Devkit -->|Runs simulations,<br/>local sandboxes| DeWordleSystem

    DeWordleSystem -->|Submits signed transactions,<br/>polls contract events| StellarNetwork
    Wallet -->|Signs & submits transactions| StellarNetwork
```

## Level 2: Container Diagram

The containers that make up the DeWordle system and how they communicate.

<!-- markdownlint-disable MD013 -->

```mermaid
flowchart TB
    Player(["Player (browser)"])

    subgraph DeWordle["DeWordle System"]
        WebClient["Web Client<br/><i>Next.js / React</i><br/>Renders the game UI,<br/>builds & requests wallet signatures"]
        API["NestJS API<br/><i>Node.js / NestJS</i><br/>REST endpoints for game sessions,<br/>leaderboard, rewards, admin"]
        Indexer["Indexer<br/><i>NestJS service</i><br/>Polls Soroban RPC for contract events,<br/>normalizes & persists them"]
        Redis[("Redis<br/><i>redis:7-alpine</i><br/>Event dedup cache,<br/>job queue, health checks")]
        Postgres[("PostgreSQL<br/><i>postgres:16-alpine</i><br/>Game sessions, guesses,<br/>leaderboard, indexed events")]
    end

    SorobanRPC["Soroban RPC<br/><i>stellar/quickstart (local) or<br/>hosted RPC (testnet/mainnet)</i>"]
    CoreGame["core_game contract<br/><i>Soroban WASM</i>"]
    Rewards["rewards contract<br/><i>Soroban WASM</i>"]
    Achievements["achievements contract<br/><i>Soroban WASM</i>"]
    AdminRegistry["admin_registry contract<br/><i>Soroban WASM</i>"]

    Player -->|HTTPS| WebClient
    WebClient -->|REST / JSON, HTTPS| API
    WebClient -->|Submits signed tx| SorobanRPC

    API -->|SQL, TypeORM| Postgres
    API -->|Cache reads/writes| Redis

    Indexer -->|getEvents JSON-RPC, polling| SorobanRPC
    Indexer -->|Persists normalized events| Postgres
    Indexer -->|Dedup TTL keys, job queue| Redis

    SorobanRPC --> CoreGame
    SorobanRPC --> Rewards
    SorobanRPC --> Achievements
    SorobanRPC --> AdminRegistry
```

### Container responsibilities & protocols

<!-- markdownlint-disable MD060 -->

| Container | Responsibility | Talks to | Protocol |
| --- | --- | --- | --- |
| **Web Client** (Next.js) | Renders the game UI; builds transactions and requests wallet signatures; calls the API for session/leaderboard data. | API, Player's wallet, Soroban RPC (for tx submission) | HTTPS/REST (API); wallet extension API; Soroban RPC JSON-RPC |
| **NestJS API** | Serves REST endpoints for game sessions, guesses, leaderboard, rewards, and admin operations. | PostgreSQL, Redis | SQL (TypeORM); Redis protocol |
| **Indexer** | Polls Soroban RPC for `core_game`/`rewards`/`achievements`/`admin_registry` contract events on an interval, validates/normalizes them, and persists them with cursor-based resumption (see `backend/src/indexer/indexer.service.ts`). | Soroban RPC, PostgreSQL, Redis | JSON-RPC (`getEvents`); SQL; Redis protocol |
| **Redis** | Event deduplication TTL cache (`EventDedupService`) so redelivered RPC events aren't double-processed; job queue backing store; liveness/health checks. | — | Redis protocol |
| **PostgreSQL** | System of record for game sessions, guess history, leaderboard standings, and indexed on-chain events/cursors. | — | SQL |
| **Soroban RPC** | Stellar's RPC surface for submitting transactions and querying contract events/ledger state. Local dev runs `stellar/quickstart` in Docker (`dewordle-soroban-rpc`); testnet/mainnet use a hosted RPC endpoint. | Soroban smart contracts | JSON-RPC over HTTP |
| **Soroban contracts** (`core_game`, `rewards`, `achievements`, `admin_registry`) | On-chain game logic: session lifecycle, guess validation, points accrual, achievement unlocks, and role/contract registry management. | — | Soroban WASM execution |

<!-- markdownlint-enable MD013 MD060 -->

## Notes

- Communication from the Indexer to Soroban RPC is **pull-based polling**,
  not a subscription/push — see `docs/architecture/sequence-diagrams.md`
  (landing in a separate PR) for the full poll-cycle sequence.
- Local development runs all of these containers via `docker-compose.yml`
  (`db`, `redis`, `soroban-rpc`, plus the `backend`/`frontend` app
  containers); see [`docs/SOROBAN_LOCAL_DEV.md`](../SOROBAN_LOCAL_DEV.md)
  for setup, and `docs/troubleshooting/soroban-rpc-guide.md` (landing in
  a separate PR) for troubleshooting.
