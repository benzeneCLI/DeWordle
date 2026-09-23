# Architecture Sequence Diagrams

> Resolves #1163

End-to-end data flow diagrams for DeWordle, rendered as GitHub-flavored
Mermaid sequence diagrams. These complement the narrative walkthrough in
[`docs/FRONTEND_DATA_FLOW_WALKTHROUGH.md`](../FRONTEND_DATA_FLOW_WALKTHROUGH.md)
and the event payload contracts in
[`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md).

## Game guess submission flow

Covers the full round trip from a player submitting a guess in the browser
to the on-chain event being reflected back in the UI: contract invocation,
event emission, RPC polling by the indexer, database persistence, and the
WebSocket broadcast that updates other connected clients (e.g. a live
leaderboard or spectator view).

```mermaid
sequenceDiagram
    actor Player
    participant FE as Frontend (Next.js)
    participant Wallet as Stellar Wallet
    participant Contract as core_game (Soroban)
    participant RPC as Soroban RPC
    participant Indexer as Indexer (indexer.service.ts)
    participant DB as PostgreSQL
    participant WS as WebSocket Gateway
    participant Other as Other connected clients

    Player->>FE: Submit guess
    FE->>Wallet: Request signature for submit_guess tx
    Wallet-->>FE: Signed transaction
    FE->>RPC: sendTransaction(signed tx)
    RPC->>Contract: Invoke submit_guess
    Contract-->>Contract: Validate guess, update session state
    Contract-->>RPC: Emit `guess_submitted` event (+ `session_finalized` if game ends)
    RPC-->>FE: Transaction result (hash, status)
    FE-->>Player: Optimistic UI update ("submitted")

    loop Poll cycle (indexer.service.ts poll())
        Indexer->>DB: Load cursor (last ledger / tx hash / event index)
        Indexer->>RPC: getEvents(contractId, cursor.lastLedger)
        RPC-->>Indexer: Raw events since cursor
        Indexer->>Indexer: Validate shape, normalize, sort by cursor order
        Indexer->>Indexer: Skip if duplicate (dedup TTL window)
        Indexer->>DB: Persist event via EventProcessorService
        Indexer->>DB: Checkpoint cursor to this event's ledger/tx/index
    end

    Indexer->>WS: Publish `guess_submitted` (and `session_finalized`, if applicable)
    WS-->>FE: Broadcast to the submitting player's session room
    WS-->>Other: Broadcast to other subscribed clients (leaderboard/spectators)
    FE-->>Player: Reconcile optimistic state with confirmed outcome
```

### Notes

- **RPC polling, not push**: the indexer pulls events from Soroban RPC on
  an interval (`poll()` in `backend/src/indexer/indexer.service.ts`) rather
  than the RPC pushing to the backend — a guess is only reflected in the
  database, and therefore broadcast over WebSocket, after the next poll
  cycle picks it up. This is why the frontend applies an optimistic update
  immediately after the transaction is submitted, ahead of confirmation.
- **Cursor-based resumption**: each stream (e.g. `core_game`) tracks its
  own cursor (`lastLedger`, `lastTxHash`, `lastEventIndex`) so a restarted
  indexer resumes exactly where it left off instead of re-scanning from
  genesis or missing events.
- **Redelivery-safe**: Soroban RPC can redeliver the same event across a
  reconnect, so the indexer checks a dedup TTL window
  (`EventDedupService`, keyed on `txHash` + `eventIndex`) before
  processing, to avoid double-counting a guess.
- **Event payload shapes**: see
  [`docs/WEBSOCKET_EVENTS.md`](../WEBSOCKET_EVENTS.md#guess_submitted) for
  the exact `guess_submitted` / `session_finalized` payload contracts
  referenced above.
