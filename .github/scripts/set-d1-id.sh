#!/usr/bin/env bash
# Replaces the placeholder database_id in worker/wrangler.jsonc with the id of the "clutch-studio" D1
# database, looked up with the Cloudflare token in the environment. Runs in CI only; nothing is committed.
set -euo pipefail
id=$(npx wrangler d1 list --json | jq -r '.[] | select(.name == "clutch-studio") | .uuid')
if [[ -z "$id" || "$id" == "null" ]]; then
  echo "D1 database clutch-studio not found: run the Bootstrap Cloudflare workflow first" >&2
  exit 1
fi
sed -i "s/00000000-0000-0000-0000-000000000000/${id}/" wrangler.jsonc
echo "Using D1 database $id"
