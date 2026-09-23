#!/usr/bin/env node
// validate_env_template.js
// Compares keys in .env against .env.example and reports missing or extraneous keys.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseEnvKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  return new Set(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim())
  );
}

const envPath = path.join(ROOT, ".env");
const examplePath = path.join(ROOT, ".env.example");

const envKeys = parseEnvKeys(envPath);
const exampleKeys = parseEnvKeys(examplePath);

const missing = [...exampleKeys].filter((k) => !envKeys.has(k));
const extraneous = [...envKeys].filter((k) => !exampleKeys.has(k));

if (missing.length > 0) {
  console.error("Missing keys in .env (required by .env.example):");
  missing.forEach((k) => console.error(`  - ${k}`));
}

if (extraneous.length > 0) {
  console.warn("Extraneous keys in .env (not in .env.example):");
  extraneous.forEach((k) => console.warn(`  + ${k}`));
}

if (missing.length === 0 && extraneous.length === 0) {
  console.log(".env is in sync with .env.example");
}

if (missing.length > 0) process.exit(1);