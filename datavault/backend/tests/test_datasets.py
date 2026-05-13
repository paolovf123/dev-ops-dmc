import pytest


@pytest.mark.asyncio
async def test_create_dataset(admin_client):
    res = await admin_client.post("/datasets", json={"name": "Ventas", "description": "Dataset de prueba"})
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Ventas"
    assert data["description"] == "Dataset de prueba"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_datasets(admin_client):
    await admin_client.post("/datasets", json={"name": "DS1"})
    await admin_client.post("/datasets", json={"name": "DS2"})
    res = await admin_client.get("/datasets")
    assert res.status_code == 200
    names = [d["name"] for d in res.json()]
    assert "DS1" in names
    assert "DS2" in names


@pytest.mark.asyncio
async def test_patch_dataset(admin_client):
    res = await admin_client.post("/datasets", json={"name": "Original"})
    ds_id = res.json()["id"]
    patch = await admin_client.patch(f"/datasets/{ds_id}", json={"name": "Renombrado"})
    assert patch.status_code == 200
    assert patch.json()["name"] == "Renombrado"


@pytest.mark.asyncio
async def test_delete_dataset(admin_client):
    res = await admin_client.post("/datasets", json={"name": "ToDelete"})
    ds_id = res.json()["id"]
    delete = await admin_client.delete(f"/datasets/{ds_id}")
    assert delete.status_code == 204
    lst = await admin_client.get("/datasets")
    ids = [d["id"] for d in lst.json()]
    assert ds_id not in ids


@pytest.mark.asyncio
async def test_viewer_cannot_create_dataset(admin_client):
    # Register viewer (inactive by default, admin must activate)
    reg = await admin_client.post("/auth/register", json={"email": "v@t.com", "username": "v", "password": "password123"})
    viewer_id = reg.json()["user"]["id"]
    await admin_client.patch(f"/auth/users/{viewer_id}/activate")
    login = await admin_client.post("/auth/login", json={"email": "v@t.com", "password": "password123"})
    token = login.json()["access_token"]
    admin_client.headers["Authorization"] = f"Bearer {token}"
    res = await admin_client.post("/datasets", json={"name": "Forbidden"})
    assert res.status_code == 403
