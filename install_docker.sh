#!/bin/bash
set -e

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repo
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
  > /etc/apt/sources.list.d/docker.list

# Install Docker Engine
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow running docker without sudo
usermod -aG docker dev 2>/dev/null || true

# Start dockerd in background
service docker start || true

echo "=== Docker instalado ==="
docker --version
docker compose version
