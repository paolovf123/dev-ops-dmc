import asyncio
from passlib.context import CryptContext
from sqlalchemy import text
from database import engine

pwd = CryptContext(schemes=["bcrypt"])
new_hash = pwd.hash("Admin1234!")

async def main():
    async with engine.begin() as conn:
        result = await conn.execute(
            text("UPDATE users SET hashed_password = :h WHERE email = :e RETURNING email, username"),
            {"h": new_hash, "e": "paolovilcapomaflores@gmail.com"}
        )
        row = result.fetchone()
        print(f"Updated: {row}")

asyncio.run(main())
