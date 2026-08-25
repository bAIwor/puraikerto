#!/bin/bash
# test-m3.sh — verify M3 reachable from this VPS via the GMI key in env file
#
# Env vars (override defaults):
#   PURAIKERTO_ENV_PATH  path to the env file containing GMI_API_KEY
#                         default: ~/.hermes/.env
set -e

ENV_PATH="${PURAIKERTO_ENV_PATH:-$HOME/.hermes/.env}"
if [ ! -f "$ENV_PATH" ]; then
  echo "FAIL: env file not found at $ENV_PATH"
  echo "Set PURAIKERTO_ENV_PATH or place a .env with GMI_API_KEY in it"
  exit 1
fi

KEY=$(grep "^GMI_API_KEY=" "$ENV_PATH" | head -1 | cut -d= -f2- | tr -d "'\"" | tr -d '\r')
if [ -z "$KEY" ]; then
  echo "FAIL: GMI_API_KEY not found in $ENV_PATH"
  exit 1
fi
echo "Key loaded: ${KEY:0:8}*** (len=${#KEY})  (env: $ENV_PATH)"
echo "---"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST https://api.gmi-serving.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMaxAI/MiniMax-M3","messages":[{"role":"user","content":"balas dengan satu kata: oke"}],"max_tokens":20}' \
  --max-time 30)
echo "$RESP"
