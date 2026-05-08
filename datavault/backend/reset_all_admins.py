import asyncio
from passlib.context import CryptContext
from sqlalchemy import text
from database import engine

async def main():
    h = CryptContext(schemes=["bcrypt"]).hash("Admin1234!")
    async with engine.begin() as conn:
        r = await conn.execute(
            text("UPDATE users SET hashed_password = :h WHERE role = 'admin' RETURNING email, username"),
            {"h": h}
        )
        for row in r:
            print(f"Updated: {row[0]} ({row[1]})")

asyncio.run(main())
