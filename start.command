#!/bin/bash
# Double-click this file to start the Milestones Music website and admin on this Mac.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed on this Mac."
  echo "  Install the LTS version from https://nodejs.org, then double-click start.command again."
  echo ""
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

if [ ! -f db/settings.json ]; then
  echo "  First run: building the database from the old-site data..."
  node tools/import-old-site.js || { read -n 1 -s -r -p "  Press any key to close."; exit 1; }
fi

( sleep 1.5; open "http://localhost:3000/admin"; open "http://localhost:3000" ) &
# Restart automatically when the site's code changes (Node 20 or newer)
if [ "$(node -p "process.versions.node.split('.')[0]")" -ge 20 ]; then
  node --watch server.js
else
  node server.js
fi
