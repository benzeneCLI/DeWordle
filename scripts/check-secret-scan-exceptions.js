#!/usr/bin/env node
/**
 * Secret-Scan Exception Governance (issue #669)
 *
 * Reads a JSON list of approved secret-scan exceptions and fails when any
 * has expired, forcing periodic re-review instead of silent indefinite
 * suppression.
 *
 * Usage:
 *   node scripts/check-secret-scan-exceptions.js [path-to-exceptions.json]
 *
 * Exceptions file shape:
 *   [{ "rule": "generic-api-key", "path": "fixtures/sample.env", "expires": "2026-08-01" }]
 */
"use strict";
const fs = require("fs");

function findExpired(exceptions, now = new Date()) {
  return exceptions.filter((entry) => new Date(entry.expires) < now);
}

function main() {
  const file = process.argv[2] || "docs/security/secret-scan-exceptions.json";
  if (!fs.existsSync(file)) {
    console.log(`No exceptions file at ${file}; nothing to govern.`);
    return;
  }

  const exceptions = JSON.parse(fs.readFileSync(file, "utf8"));
  const expired = findExpired(exceptions);

  if (expired.length > 0) {
    console.error("Expired secret-scan exceptions require re-review:");
    for (const entry of expired) {
      console.error(`  - ${entry.rule} (${entry.path}) expired ${entry.expires}`);
    }
    process.exit(1);
  }

  console.log(`All ${exceptions.length} secret-scan exceptions are within their review window.`);
}

if (require.main === module) {
  main();
}

module.exports = { findExpired };
