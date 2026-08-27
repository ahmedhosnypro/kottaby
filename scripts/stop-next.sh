#!/usr/bin/env bash

# Script to stop all running Next.js processes

echo "Checking for running Next.js processes..."

# Find PIDs matching next-server or node running next
PIDS=$(pgrep -f "next-server|node.*next" 2>/dev/null)

if [ -z "$PIDS" ]; then
    echo "✓ No running Next.js processes found."
else
    echo "Found Next.js processes: $PIDS"
    echo "Terminating processes..."
    kill -9 $PIDS 2>/dev/null
    sleep 1
    echo "✓ All Next.js processes stopped."
fi

echo ""
echo "--- Current Memory Status ---"
free -h
