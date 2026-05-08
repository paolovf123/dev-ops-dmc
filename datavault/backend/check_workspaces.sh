#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@datavault.com","password":"Admin1234!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo "=== Workspaces (admin ve todos) ==="
curl -s http://localhost:8000/workspaces \
  -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
wss = json.load(sys.stdin)
for w in wss:
    print(f"  [{w[\"my_role\"]}] {w[\"name\"]} — {w[\"description\"]}")
'

echo ""
echo "=== Datasets por workspace ==="
WS_IDS=$(curl -s http://localhost:8000/workspaces \
  -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
wss = json.load(sys.stdin)
for w in wss:
    print(w["id"]+"|"+w["name"])
')

for entry in $WS_IDS; do
  WS_ID=$(echo $entry | cut -d'|' -f1)
  WS_NAME=$(echo $entry | cut -d'|' -f2)
  echo "  Workspace: $WS_NAME"
  curl -s "http://localhost:8000/datasets?workspace_id=$WS_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
ds = json.load(sys.stdin)
for d in ds:
    print(f"    - {d[\"name\"]} ({d[\"description\"]})")
'
done

echo ""
echo "=== Login como ana (solo ve Ventas) ==="
TOKEN_ANA=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@empresa.com","password":"Pass1234!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

curl -s http://localhost:8000/workspaces \
  -H "Authorization: Bearer $TOKEN_ANA" | python3 -c '
import sys,json
wss = json.load(sys.stdin)
for w in wss:
    print(f"  [{w[\"my_role\"]}] {w[\"name\"]}")
'
