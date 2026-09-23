#!/usr/bin/env node
/**
 * Deploy Manifest Generator (issue #667)
 *
 * Writes a versioned manifest of deployed contract ids and network
 * metadata so the SDK loader can resolve a specific registry snapshot.
 *
 * Usage:
 *   ADMIN_REGISTRY_ID=... CORE_GAME_ID=... REWARDS_ID=... ACHIEVEMENTS_ID=... \
 *   NETWORK=testnet node soroban/scripts/deploy/generate-manifest.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

function buildManifest(env) {
  const network = env.NETWORK || "testnet";
  const required = ["ADMIN_REGISTRY_ID", "CORE_GAME_ID", "REWARDS_ID", "ACHIEVEMENTS_ID"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    version: 1,
    network,
    generatedAt: new Date().toISOString(),
    contracts: {
      admin_registry: env.ADMIN_REGISTRY_ID,
      core_game: env.CORE_GAME_ID,
      rewards: env.REWARDS_ID,
      achievements: env.ACHIEVEMENTS_ID,
    },
  };
}

function main() {
  const manifest = buildManifest(process.env);
  const outDir = path.join(__dirname);
  const outFile = path.join(outDir, `manifest.${manifest.network}.json`);
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${outFile}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { buildManifest };
