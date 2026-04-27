#!/bin/bash
# Arranca Docker daemon si no está corriendo y levanta el proyecto
service docker start 2>/dev/null || true
sleep 1

cd /mnt/c/Users/USER/Documents/migra/datavault
docker compose up --build "$@"
