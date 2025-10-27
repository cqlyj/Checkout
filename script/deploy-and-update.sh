#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." &> /dev/null && pwd)"

cd "${PROJECT_ROOT}"

# Load optional secrets from frontend/.env.local if present and not already exported
FRONTEND_ENV="${PROJECT_ROOT}/frontend/.env.local"
if [[ -f "${FRONTEND_ENV}" ]]; then
  # Only export if not already defined in the environment
  if [[ -z "${EIP7702_PRIVATE_KEY:-}" ]]; then
    val=$(grep -E '^EIP7702_PRIVATE_KEY=' -m1 "${FRONTEND_ENV}" | cut -d'=' -f2- || true)
    # strip surrounding quotes if any
    val="${val%\' }"; val="${val#\' }"; val="${val%\"}"; val="${val#\"}"
    if [[ -n "${val}" ]]; then export EIP7702_PRIVATE_KEY="${val}"; fi
  fi
  if [[ -z "${CONNECTED_WALLET_ADDRESS:-}" ]]; then
    val=$(grep -E '^CONNECTED_WALLET_ADDRESS=' -m1 "${FRONTEND_ENV}" | cut -d'=' -f2- || true)
    val="${val%\' }"; val="${val#\' }"; val="${val%\"}"; val="${val#\"}"
    if [[ -n "${val}" ]]; then export CONNECTED_WALLET_ADDRESS="${val}"; fi
  fi
fi

# Run deploy (inherit env such as ARBITRUM_SEPOLIA_RPC_URL, EIP7702_PRIVATE_KEY, CONNECTED_WALLET_ADDRESS)
make deploy-all

# Update env files from produced addresses.txt
bash "${PROJECT_ROOT}/script/update-envs.sh"

echo "Done: deployment + env update."

