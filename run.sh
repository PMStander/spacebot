#!/bin/bash

set -e

echo "🚀 Building Spacebot..."
echo ""

# Build frontend
echo "📦 Building frontend..."
cd interface
npm install --silent
npm run build
cd ..

echo ""
echo "🦀 Building Rust binary..."
cargo build --release

echo ""
echo "✅ Build complete!"
echo ""

# Check if already running
if [ -f ~/.spacebot/spacebot.pid ]; then
    PID=$(cat ~/.spacebot/spacebot.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Spacebot is already running (PID: $PID)"
        echo "   Stopping existing instance..."
        chmod +x ./target/release/spacebot
        ./target/release/spacebot stop
        sleep 2
    fi
fi

# Start spacebot in foreground
echo "🌟 Starting Spacebot..."
echo "   Web UI: http://localhost:19898"
echo ""

# Open browser after a short delay
(sleep 3 && open http://localhost:19898) &

# Run spacebot
./target/release/spacebot start --foreground
