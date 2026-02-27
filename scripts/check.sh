#!/usr/bin/env bash
set -euo pipefail

echo "Running API tests"
(
  cd services/api
  if command -v uv >/dev/null 2>&1; then
    uv run pytest -q
  else
    echo "uv not installed; skip API tests"
  fi
)

echo "Static checks placeholder complete"
