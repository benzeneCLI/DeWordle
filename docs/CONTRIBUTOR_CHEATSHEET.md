# Contributor Command Cheat-Sheet (issue #670)

Quick reference for the daily contributor loop, grouped by track.

## All tracks

```bash
npm run install:all   # install backend + frontend deps
npm run lint          # lint backend + frontend
npm run typecheck      # typecheck backend + frontend
```

## Frontend (FE)

```bash
npm run verify:frontend   # install, lint, typecheck, build, test
```

## Backend (BE)

```bash
npm run verify:backend    # install, build, typecheck, lint:ci, test:ci
npm run test:e2e
```

## Smart Contracts (SC)

```bash
npm run soroban:check     # cargo check --workspace
npm run soroban:fmt       # cargo fmt --all
```

## QA / DevOps

```bash
./scripts/ci-local.sh         # run local CI equivalent
./scripts/validate-phase3.sh  # phase validation checks
```

## DX

```bash
npm run bootstrap          # contributor environment bootstrap
npm run docs:linkcheck      # scan markdown for stale links
```

## Video walkthroughs

No walkthrough videos have been recorded yet — this section is a
placeholder so links can be dropped in here directly once they exist,
rather than scattering them across issues/PRs. Until then, the written
architectural overview covers the same ground:

- [Local Soroban development](./SOROBAN_LOCAL_DEV.md) — the local
  environment setup a "getting started" video would demo.
- `docs/architecture/` and `docs/troubleshooting/` (once merged) will
  hold the system context/container diagram, the guess-submission
  sequence diagram, and RPC troubleshooting steps a walkthrough would
  otherwise cover — link to those here directly once they land on
  `main`.

| Track | Walkthrough | Status |
| --- | --- | --- |
| Full onboarding | — | Not yet recorded |
| Backend / indexer | — | Not yet recorded |
| Frontend | — | Not yet recorded |
| Smart contracts (Soroban) | — | Not yet recorded |

If you record one of these, replace the `—`/`Not yet recorded` cells
above with the video link in the same PR.

See `CONTRIBUTING.md` for the full first-PR checklist.
