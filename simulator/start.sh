#!/bin/bash
# simulator/start.sh — run on the GCE VM
set -e

IMAGE="us-central1-docker.pkg.dev/flowindex-mainnet/flowindex/simulator:latest"
docker pull "$IMAGE"
docker stop simulator 2>/dev/null || true
docker rm simulator 2>/dev/null || true

docker run -d \
  --restart=always \
  --name simulator \
  --network=host \
  -v simulator-data:/data \
  "$IMAGE"
