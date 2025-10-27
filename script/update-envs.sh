#!/usr/bin/env bash
set -euo pipefail

# Updates env files based on addresses.txt produced by DeployAll.s.sol

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." &> /dev/null && pwd)"

ADDRESSES_FILE="${PROJECT_ROOT}/addresses.txt"
FRONTEND_ENV="${PROJECT_ROOT}/frontend/.env.local"
VLAYERVITE_ENV="${PROJECT_ROOT}/email_recovery/vlayer/.env"

if [[ ! -f "${ADDRESSES_FILE}" ]]; then
  echo "Error: ${ADDRESSES_FILE} not found. Run deployment first." >&2
  exit 1
fi

mkdir -p "${PROJECT_ROOT}/frontend" "${PROJECT_ROOT}/email_recovery/vlayer"
touch "${FRONTEND_ENV}" "${VLAYERVITE_ENV}"

get_addr() {
  # Args: KEY (e.g., EMAIL_DOMAIN_PROVER)
  local key="$1"
  local value
  value="$(grep -E "^${key}=" -m1 "${ADDRESSES_FILE}" | cut -d'=' -f2- || true)"
  if [[ -n "${value:-}" ]]; then
    echo "${value}"
    return 0
  fi
  # Fallback to legacy human logs
  local legacy_label=""
  case "${key}" in
    EMAIL_DOMAIN_PROVER) legacy_label="EmailDomainProver" ;;
    EMAIL_DOMAIN_VERIFIER) legacy_label="EmailDomainVerifier" ;;
    MOCK_USDC) legacy_label="MockUSDC" ;;
    REGISTRY) legacy_label="Registry" ;;
    DELEGATION) legacy_label="Delegation" ;;
    *) ;;
  esac
  if [[ -n "${legacy_label}" ]]; then
    value="$(grep -E "^\s*${legacy_label} deployed at:\s*0x[0-9a-fA-F]{40}\s*$" -m1 "${ADDRESSES_FILE}" | awk '{print $NF}' || true)"
  fi
  echo -n "${value:-}"
}

update_var_in_file() {
  # Args: FILE KEY VALUE
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -qE "^${key}[[:space:]]*=" "${file}"; then
    sed -i -E "s|^${key}[[:space:]]*=.*$|${key}=${value}|" "${file}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${file}"
  fi
}

# Read addresses
EMAIL_DOMAIN_PROVER_ADDR="$(get_addr EMAIL_DOMAIN_PROVER)"
EMAIL_DOMAIN_VERIFIER_ADDR="$(get_addr EMAIL_DOMAIN_VERIFIER)"
MOCK_USDC_ADDR="$(get_addr MOCK_USDC)"
REGISTRY_ADDR="$(get_addr REGISTRY)"
DELEGATION_ADDR="$(get_addr DELEGATION)"

missing=0
for var in EMAIL_DOMAIN_PROVER_ADDR EMAIL_DOMAIN_VERIFIER_ADDR MOCK_USDC_ADDR REGISTRY_ADDR DELEGATION_ADDR; do
  if [[ -z "${!var:-}" ]]; then
    echo "Warning: ${var} not found in ${ADDRESSES_FILE}" >&2
    missing=1
  fi
done
if [[ "${missing}" -ne 0 ]]; then
  echo "Some addresses are missing; proceeding to update what we have." >&2
fi

# Update frontend env
if [[ -n "${EMAIL_DOMAIN_VERIFIER_ADDR}" ]]; then
  update_var_in_file "${FRONTEND_ENV}" "EMAIL_VERIFIER_CONTRACT_ADDRESS" "${EMAIL_DOMAIN_VERIFIER_ADDR}"
fi
if [[ -n "${MOCK_USDC_ADDR}" ]]; then
  update_var_in_file "${FRONTEND_ENV}" "NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS" "${MOCK_USDC_ADDR}"
fi
if [[ -n "${REGISTRY_ADDR}" ]]; then
  update_var_in_file "${FRONTEND_ENV}" "REGISTRY_CONTRACT_ADDRESS" "${REGISTRY_ADDR}"
fi
if [[ -n "${DELEGATION_ADDR}" ]]; then
  update_var_in_file "${FRONTEND_ENV}" "EIP7702_AUTHORITY_ADDRESS" "${DELEGATION_ADDR}"
fi

# Update vlayer env
if [[ -n "${EMAIL_DOMAIN_PROVER_ADDR}" ]]; then
  update_var_in_file "${VLAYERVITE_ENV}" "VITE_PROVER_ADDRESS" "${EMAIL_DOMAIN_PROVER_ADDR}"
fi
if [[ -n "${EMAIL_DOMAIN_VERIFIER_ADDR}" ]]; then
  update_var_in_file "${VLAYERVITE_ENV}" "VITE_VERIFIER_ADDRESS" "${EMAIL_DOMAIN_VERIFIER_ADDR}"
fi

echo "Updated:"
echo "  - ${FRONTEND_ENV}"
echo "  - ${VLAYERVITE_ENV}"

