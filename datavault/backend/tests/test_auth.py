import pytest


@pytest.mark.asyncio
async def test_register_first_user_is_admin(client):
    res = await client.post("/auth/register", json={
        "email": "first@test.com",
        "username": "first",
        "password": "password123",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["role"] == "admin"
    assert "access_token" in data


@pytest.mark.asyncio
async def test_register_second_user_is_viewer(client):
    await client.post("/auth/register", json={
        "email": "admin@test.com", "username": "admin", "password": "pass123"
    })
    res = await client.post("/auth/register", json={
        "email": "viewer@test.com", "username": "viewer", "password": "pass123"
    })
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "viewer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    await client.post("/auth/register", json={
        "email": "dup@test.com", "username": "u1", "password": "pass123"
    })
    res = await client.post("/auth/register", json={
        "email": "dup@test.com", "username": "u2", "password": "pass123"
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/auth/register", json={
        "email": "user@test.com", "username": "user", "password": "mypass"
    })
    res = await client.post("/auth/login", json={
        "email": "user@test.com", "password": "mypass"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/auth/register", json={
        "email": "u@test.com", "username": "u", "password": "correct"
    })
    res = await client.post("/auth/login", json={
        "email": "u@test.com", "password": "wrong"
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user(admin_client):
    res = await admin_client.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == "admin@test.com"


@pytest.mark.asyncio
async def test_unauthenticated_request(client):
    res = await client.get("/auth/me")
    assert res.status_code == 401
