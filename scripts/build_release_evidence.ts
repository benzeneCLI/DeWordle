#!/usr/bin/env ts-node
// build_release_evidence.ts
// Packages frontend build outputs and SHA-256 checksums into a release evidence zip.

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as childProcess from "child_process";

const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts");
const BUILD_DIR = path.resolve(__dirname, "../frontend/.next");
const OUTPUT_ZIP = path.join(ARTIFACTS_DIR, "frontend-release-evidence.zip");

function sha256File(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(ARTIFACTS_DIR);

  const checksumFile = path.join(ARTIFACTS_DIR, "checksums.txt");
  const lines: string[] = [];

  if (fs.existsSync(BUILD_DIR)) {
    const files = fs.readdirSync(BUILD_DIR, { recursive: true }) as string[];
    for (const f of files) {
      const full = path.join(BUILD_DIR, f);
      if (fs.statSync(full).isFile()) {
        lines.push(`${sha256File(full)}  ${f}`);
      }
    }
  }

  fs.writeFileSync(checksumFile, lines.join("\n") + "\n");
  console.log(`Checksums written to ${checksumFile}`);

  childProcess.execSync(
    `zip -r "${OUTPUT_ZIP}" "${BUILD_DIR}" "${checksumFile}"`,
    { stdio: "inherit" }
  );

  console.log(`Release evidence package created: ${OUTPUT_ZIP}`);
}

main();