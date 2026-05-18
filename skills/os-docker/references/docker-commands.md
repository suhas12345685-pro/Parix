# Docker Command Reference for Parix

## Compose Lifecycle

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start all services |
| `docker compose down` | Stop and remove containers |
| `docker compose restart` | Restart all services |
| `docker compose build --no-cache` | Rebuild images |
| `docker compose pull` | Pull latest images |
| `docker compose ps` | List running containers |

## Logs

| Command | Description |
|---------|-------------|
| `docker compose logs -f` | Follow all logs |
| `docker compose logs -f atrium` | Follow specific service |
| `docker compose logs --tail=50 hands` | Last 50 lines |
| `docker compose logs --since 5m` | Last 5 minutes |

## Container Inspection

| Command | Description |
|---------|-------------|
| `docker exec -it parix-atrium sh` | Shell into Atrium |
| `docker exec -it parix-hands bash` | Shell into Hands |
| `docker inspect parix-atrium` | Full container details |
| `docker top parix-hands` | Processes in container |
| `docker stats` | Live resource usage |

## Volume Management

| Command | Description |
|---------|-------------|
| `docker volume ls` | List volumes |
| `docker volume inspect parix-data` | Volume details |
| `docker volume rm parix-data` | Delete volume (data loss!) |
| Backup: `docker run --rm -v parix-data:/data -v $(pwd):/bk alpine tar czf /bk/backup.tar.gz /data` | |
| Restore: `docker run --rm -v parix-data:/data -v $(pwd):/bk alpine tar xzf /bk/backup.tar.gz -C /` | |

## Network

| Command | Description |
|---------|-------------|
| `docker network ls` | List networks |
| `docker network inspect parix-net` | Network details |
| `docker exec parix-atrium ping hands` | Test internal DNS |

## Image Management

| Command | Description |
|---------|-------------|
| `docker images` | List local images |
| `docker build -t name:tag .` | Build image |
| `docker tag img ghcr.io/org/img:v1` | Tag for registry |
| `docker push ghcr.io/org/img:v1` | Push to registry |
| `docker system prune` | Clean unused resources |
| `docker system df` | Disk usage by Docker |

## Health Checks

| Endpoint | Method | Expected |
|----------|--------|----------|
| `http://localhost:8766/health` | HTTP GET | 200 OK (Atrium) |
| `localhost:8765` | TCP socket | Connection accepted (Hands) |

## Kubernetes (if scaling)

| Command | Description |
|---------|-------------|
| `kubectl apply -f deploy/k8s/` | Deploy manifests |
| `kubectl get pods -n parix` | List pods |
| `kubectl logs -f deploy/atrium -n parix` | Follow logs |
| `kubectl port-forward svc/atrium-svc 8766:8766 -n parix` | Port forward |
| `kubectl create secret generic parix-secrets --from-env-file=.env -n parix` | Create secrets |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Container won't start | `docker compose logs <svc>` |
| Port conflict | `ss -tlnp \| grep 8766` or `netstat -an \| findstr 8766` |
| Out of disk | `docker system df` then `docker system prune` |
| Hands unreachable | `docker exec parix-atrium ping hands` |
| Data missing | `docker volume inspect parix-data` |
