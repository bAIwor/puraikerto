#!/bin/bash
# test-m3.sh — verify M3 reachable from this VPS via the GMI key already in ~/.hermes/.env
set -e
KEY=$(grep "^GMI_API_KEY=" /home/wijang/.hermes/.env | cut -d= -f2- | tr -d "'\"" | tr -d '\r')
if [ -z "$KEY" ]; then
  echo "FAIL: GMI_API_KEY not found in ~/.hermes/.env"
  exit 1
fi
echo "Key loaded: ${KEY:0:8}*** (len=${#KEY})"
echo "---"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST https://api.gmi-serving.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMaxAI/MiniMax-M3","messages":[{"role":"user","content":"balas dengan satu kata: oke"}],"max_tokens":20}' \
  --max-time 30)
echo "$RESP"
