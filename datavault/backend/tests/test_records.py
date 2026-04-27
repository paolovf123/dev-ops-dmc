import pytest


async def _setup(client):
    """Helper: create dataset + columns, return (dataset_id, col_text_key, col_num_key)."""
    ds = await client.post("/datasets", json={"name": "Test"})
    ds_id = ds.json()["id"]
    await client.post(f"/datasets/{ds_id}/columns", json={
        "name": "Nombre", "field_key": "nombre", "data_type": "text",
        "rules": {"required": True}, "position": 0,
    })
    await client.post(f"/datasets/{ds_id}/columns", json={
        "name": "Edad", "field_key": "edad", "data_type": "number",
        "rules": {"min": 0, "max": 120}, "position": 1,
    })
    await client.post(f"/datasets/{ds_id}/columns", json={
        "name": "Activo", "field_key": "activo", "data_type": "boolean",
        "rules": {}, "position": 2,
    })
    return ds_id


@pytest.mark.asyncio
async def test_create_record(admin_client):
    ds_id = await _setup(admin_client)
    res = await admin_client.post(f"/datasets/{ds_id}/records", json={
        "data": {"nombre": "Ana", "edad": 30, "activo": True}
    })
    assert res.status_code == 201
    assert res.json()["data"]["nombre"] == "Ana"


@pytest.mark.asyncio
async def test_list_records_pagination(admin_client):
    ds_id = await _setup(admin_client)
    for i in range(5):
        await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": f"User{i}"}})
    res = await admin_client.get(f"/datasets/{ds_id}/records?skip=0&limit=3")
    assert res.status_code == 200
    assert len(res.json()) == 3
    assert res.headers.get("x-total-count") == "5"


@pytest.mark.asyncio
async def test_search_records(admin_client):
    ds_id = await _setup(admin_client)
    await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Carlos"}})
    await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Lucia"}})
    res = await admin_client.get(f"/datasets/{ds_id}/records?search=Carlos")
    assert res.status_code == 200
    names = [r["data"]["nombre"] for r in res.json()]
    assert "Carlos" in names
    assert "Lucia" not in names


@pytest.mark.asyncio
async def test_update_record(admin_client):
    ds_id = await _setup(admin_client)
    create = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Ana"}})
    rec_id = create.json()["id"]
    patch = await admin_client.patch(f"/datasets/{ds_id}/records/{rec_id}", json={"data": {"nombre": "Ana Gomez"}})
    assert patch.status_code == 200
    assert patch.json()["data"]["nombre"] == "Ana Gomez"


@pytest.mark.asyncio
async def test_soft_delete_and_restore(admin_client):
    ds_id = await _setup(admin_client)
    create = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Bob"}})
    rec_id = create.json()["id"]

    # Soft delete
    await admin_client.delete(f"/datasets/{ds_id}/records/{rec_id}")
    lst = await admin_client.get(f"/datasets/{ds_id}/records")
    assert all(r["id"] != rec_id for r in lst.json())

    # Visible with include_deleted
    lst_del = await admin_client.get(f"/datasets/{ds_id}/records?include_deleted=true")
    assert any(r["id"] == rec_id for r in lst_del.json())

    # Restore
    restore = await admin_client.post(f"/datasets/{ds_id}/records/{rec_id}/restore")
    assert restore.status_code == 200
    lst2 = await admin_client.get(f"/datasets/{ds_id}/records")
    assert any(r["id"] == rec_id for r in lst2.json())


@pytest.mark.asyncio
async def test_boolean_column_validation(admin_client):
    ds_id = await _setup(admin_client)
    # Valid boolean
    res = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "X", "activo": True}})
    assert res.status_code == 201
    # Invalid boolean value
    res_bad = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Y", "activo": "maybe"}})
    assert res_bad.status_code == 422


@pytest.mark.asyncio
async def test_number_validation_min_max(admin_client):
    ds_id = await _setup(admin_client)
    res = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "X", "edad": 200}})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_record_history(admin_client):
    ds_id = await _setup(admin_client)
    create = await admin_client.post(f"/datasets/{ds_id}/records", json={"data": {"nombre": "Ana"}})
    rec_id = create.json()["id"]
    await admin_client.patch(f"/datasets/{ds_id}/records/{rec_id}", json={"data": {"nombre": "Ana Gomez"}})
    hist = await admin_client.get(f"/datasets/{ds_id}/records/{rec_id}/history")
    assert hist.status_code == 200
    actions = [h["action"] for h in hist.json()]
    assert "create" in actions
    assert "update" in actions
