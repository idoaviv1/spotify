#!/usr/bin/env bash
# ==============================================================================
# SonicLink - Personal Music Streamer Startup Script
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detect Tailscale IPv4
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "100.127.161.16")
PORT=8686

# ─── Port Cleanup & Signal Handling ───
cleanup() {
    # Prevent repeated invocation
    trap - SIGINT SIGTERM SIGHUP EXIT
    echo ""
    echo "🛑 Stopping SonicLink server..."
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -TERM "$SERVER_PID" 2>/dev/null || true
        for _ in {1..20}; do
            if ! kill -0 "$SERVER_PID" 2>/dev/null; then
                break
            fi
            sleep 0.1
        done
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            kill -9 "$SERVER_PID" 2>/dev/null || true
        fi
    fi
    # Ensure port 8686 is completely freed
    fuser -k -9 "${PORT}/tcp" 2>/dev/null || true
    echo "✅ Port ${PORT} has been freed. Server stopped cleanly."
    exit 0
}

trap cleanup SIGINT SIGTERM SIGHUP EXIT

# Proactively release port if already in use by a stale process
if fuser "${PORT}/tcp" >/dev/null 2>&1; then
    echo "⚠️  Port ${PORT} is currently in use by an old process. Freeing port..."
    fuser -k -9 "${PORT}/tcp" 2>/dev/null || true
    sleep 0.5
fi
pkill -9 -f "uvicorn.*main:app.*${PORT}" 2>/dev/null || true

echo "=================================================================="
echo "🎵  Starting SonicLink Personal Music Server..."
echo "=================================================================="
echo "📱  Tailscale URL (for your iPhone): http://${TAILSCALE_IP}:${PORT}"
echo "💻  Localhost URL:                    http://localhost:${PORT}"
echo "=================================================================="

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "📦 Building frontend production bundle..."
    cd frontend && npm run build && cd ..
fi

# Run backend FastAPI server in background so trap handles signals properly
echo "🚀 Launching server..."
backend/venv/bin/python backend/main.py &
SERVER_PID=$!

# Wait for server process
wait "$SERVER_PID" 2>/dev/null || true
