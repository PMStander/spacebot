#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
	pkill -P $$ >/dev/null 2>&1 || true
}

trap cleanup EXIT

existing_spacebot="$(pgrep -f 'target/debug/spacebot' || true)"
if [ -n "$existing_spacebot" ]; then
	echo "Stopping existing spacebot process(es): $existing_spacebot"
	kill "$existing_spacebot"
	sleep 1
fi

echo "Starting frontend (interface)..."
npm --prefix "$SCRIPT_DIR/interface" run dev &
FRONTEND_PID=$!

echo "Waiting a few seconds for frontend to spin up..."
sleep 3

echo "Starting backend (spacebot) with verbose discord logging..."
RUST_LOG=discord=trace,spacebot=info cargo run --bin spacebot

wait "$FRONTEND_PID"
