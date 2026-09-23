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

See `CONTRIBUTING.md` for the full first-PR checklist.
