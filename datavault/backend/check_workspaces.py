import urllib.request
import json

BASE = "http://localhost:8000"

def post(path, data, token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})},
        method="POST"
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def get(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

print("=== Login admin ===")
resp = post("/auth/login", {"email": "admin@datavault.com", "password": "Admin1234!"})
token_admin = resp["access_token"]
print("OK - token obtenido")

print("\n=== Workspaces (admin ve todos) ===")
wss = get("/workspaces", token_admin)
for w in wss:
    print("  [" + str(w["my_role"]) + "] " + w["name"] + " - " + str(w["description"]))

print("\n=== Datasets por workspace ===")
for w in wss:
    ds = get("/datasets?workspace_id=" + w["id"], token_admin)
    print("  Workspace: " + w["name"] + " (" + str(len(ds)) + " datasets)")
    for d in ds:
        print("    - " + d["name"])

print("\n=== Login como ANA (solo Ventas) ===")
resp2 = post("/auth/login", {"email": "ana@empresa.com", "password": "Pass1234!"})
token_ana = resp2["access_token"]
wss_ana = get("/workspaces", token_ana)
print("Ana ve " + str(len(wss_ana)) + " workspace(s):")
for w in wss_ana:
    print("  [" + str(w["my_role"]) + "] " + w["name"])

print("\n=== Login como MARIO (solo Operaciones) ===")
resp3 = post("/auth/login", {"email": "mario@empresa.com", "password": "Pass1234!"})
token_mario = resp3["access_token"]
wss_mario = get("/workspaces", token_mario)
print("Mario ve " + str(len(wss_mario)) + " workspace(s):")
for w in wss_mario:
    print("  [" + str(w["my_role"]) + "] " + w["name"])

print("\n=== Miembros del workspace Ventas ===")
ws_ventas = next(w for w in wss if w["name"] == "Ventas")
members = get("/workspaces/" + ws_ventas["id"] + "/members", token_admin)
for m in members:
    print("  " + m["username"] + " <" + m["email"] + "> rol=" + m["role"])

print("\n=== Todo OK! ===")
