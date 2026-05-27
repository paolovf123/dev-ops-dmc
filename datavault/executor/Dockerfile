FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py runner.py ./

# Usuario sin privilegios (defensa: el código del usuario corre como este user).
RUN useradd -m -u 10001 runner
USER runner

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
