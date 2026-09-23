#!/usr/bin/env bash
# profile_wasm_bloat.sh
# Runs cargo-bloat to identify the top 20 functions contributing to Soroban WASM binary size.
# Output is saved to target/wasm_bloat_report.txt.

set -euo pipefail

REPORT_DIR="target"
REPORT_FILE="$REPORT_DIR/wasm_bloat_report.txt"

mkdir -p "$REPORT_DIR"

echo "Running cargo bloat for wasm32-unknown-unknown (release)..."
cargo bloat --target wasm32-unknown-unknown --release -n 20 | tee "$REPORT_FILE"

echo ""
echo "Report saved to $REPORT_FILE"