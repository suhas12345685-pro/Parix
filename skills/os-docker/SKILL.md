---
name: os-docker
description: Parix OS Skill — Docker
---

# Parix OS Skill — Docker

> Runtime: Docker 24+ / Podman 4+ | Compose: v2+
> For containerized deployment where Parix runs as a service rather than a desktop agent.

## When to Use Docker

Docker mode is for running Parix as a **headless service** — monitoring, task execution, and notifications without desktop UI automation. Use native OS deploy for full accessibility/vision features.

| Feature | Docker | Native |
|---------|--------|--------|
| CLI task execution | Yes | Yes |
| System monitoring | Container-scoped | Full OS |
| Accessibility (UI) | No | Yes |
| Vision/OCR | No | Yes |
| Notifications | API-based only (Telegram, webhooks) | Native + API |
| File system access | Mounted volumes only | Full |
| Network monitoring | Container network | Full |

## Architecture

```
docker-compose.yml
  |-- parix-atrium  (Node.js brain, port 8766)
  |-- parix-hands   (Python executor, port 8765)
  |-- volume: parix-data (SQLite persistence)
  |-- network: parix-net (internal bridge)
```

## Capabilities

### Container Management
- **Start**: `docker compose up -d` (from `deploy/docker/`).
- **Stop**: `docker compose down`.
- **Logs**: `docker compose logs -f atrium`, `docker compose logs -f hands`.
- **Restart**: `docker compose restart atrium`.
- **Rebuild**: `docker compose build --no-cache`.
- **Shell into**: `docker exec -it parix-atrium sh`, `docker exec -it parix-hands bash`.
- **Health**: `docker inspect --format='{{.State.Health.Status}}' parix-atrium`.

### Resource Monitoring (Container-Scoped)
- **Stats**: `docker stats parix-atrium parix-hands`.
- **Top**: `docker top parix-hands`.
- **Inspect**: `docker inspect parix-atrium`.
- **Disk**: `docker system df`.

### Volume Management
- **Data volume**: `parix-data` mounted at `/app/data` in Atrium.
- **Backup**: `docker run --rm -v parix-data:/data -v $(pwd):/backup alpine tar czf /backup/parix-backup.tar.gz /data`.
- **Restore**: `docker run --rm -v parix-data:/data -v $(pwd):/backup alpine tar xzf /backup/parix-backup.tar.gz -C /`.

### Networking
- **Internal**: Atrium connects to Hands via `ws://hands:8765` (Docker DNS).
- **External**: Aegis relay exposed on host port `8766`.
- **Custom network**: `parix-net` bridge network isolates services.

### Environment & Secrets
- **Env file**: `deploy/docker/.env` or root `.env` (referenced by `env_file` in compose).
- **Secrets**: Use Docker secrets or env vars for API keys.
- **Override**: `docker compose -f docker-compose.yml -f docker-compose.override.yml up`.

### Scaling (Kubernetes)
- **K8s manifests**: `deploy/k8s/parix.yaml`.
- **Apply**: `kubectl apply -f deploy/k8s/`.
- **Secrets**: `kubectl create secret generic parix-secrets --from-env-file=.env -n parix`.
- **Logs**: `kubectl logs -f deployment/atrium -n parix`.
- **Port forward**: `kubectl port-forward svc/atrium-svc 8766:8766 -n parix`.

### Health Checks
- **Atrium**: HTTP GET `http://localhost:8766/health` (30s interval).
- **Hands**: TCP socket check on port `8765` (15s interval).
- **Compose**: `depends_on.hands.condition: service_healthy` ensures Hands starts first.

### Image Management
- **Build local**: `docker build -f deploy/docker/Dockerfile.atrium -t parix-atrium:latest .`
- **Tag**: `docker tag parix-atrium:latest ghcr.io/ahmedkhaledp-0/parix-atrium:v0.1`.
- **Push**: `docker push ghcr.io/ahmedkhaledp-0/parix-atrium:v0.1`.
- **Multi-arch**: Build with `docker buildx build --platform linux/amd64,linux/arm64`.

## Docker-Specific Task Execution

When running inside Docker, the Hands executor operates in a container context:

| Task | Behavior | Notes |
|------|----------|-------|
| CLI commands | Runs inside container | Only container binaries available |
| File read/write | Volume-mounted paths only | `/app/data/` persists |
| Network requests | Container network | Can reach internet + internal services |
| Process monitoring | Container processes only | Cannot see host processes |
| Notifications | Telegram/webhook only | No desktop notifications |
| Screenshots | Not available | No display server |
| Accessibility | Not available | No desktop session |

## Compose Commands Reference

```bash
# Start in background
docker compose -f deploy/docker/docker-compose.yml up -d

# View logs
docker compose -f deploy/docker/docker-compose.yml logs -f

# Stop
docker compose -f deploy/docker/docker-compose.yml down

# Stop and remove volumes (WARNING: deletes data)
docker compose -f deploy/docker/docker-compose.yml down -v

# Rebuild after code changes
docker compose -f deploy/docker/docker-compose.yml build
docker compose -f deploy/docker/docker-compose.yml up -d

# Run one-off command in Hands
docker compose -f deploy/docker/docker-compose.yml exec hands python -c "print('hello')"
```

## Limitations

- No desktop UI automation (no display, no accessibility APIs).
- No native OS notifications — API-based channels only (Telegram, Slack, webhooks).
- File system limited to mounted volumes.
- Cannot monitor host OS metrics directly (use Prometheus node_exporter for that).
- Container restarts lose in-memory state — SQLite persistence handles recovery.
- ARM images need explicit `--platform` flag or multi-arch build.
