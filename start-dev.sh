#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the Express API server on port 3001 (override any PORT env)
cd "$SCRIPT_DIR/server" && PORT=3001 node index.js &
SERVER_PID=$!

# Give the server a moment to start
sleep 1

# Start Vite dev server in the foreground
cd "$SCRIPT_DIR" && npx vite --host

# Clean up server when Vite exits
kill $SERVER_PID 2>/dev/null
