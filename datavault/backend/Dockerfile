# Stage 1: builder — instala dependencias en /install, sin cache de pip
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: runtime — imagen final, sin toolchain ni cache de pip
FROM python:3.11-slim

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

COPY --from=builder /install /usr/local

COPY --chown=appuser:appgroup . .

USER appuser
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
