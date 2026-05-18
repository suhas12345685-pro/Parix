# Docker Management Quick Reference

## Cleanup Commands

| Action | Command |
|---|---|
| Remove stopped containers | `docker container prune -f` |
| Remove dangling images | `docker image prune -f` |
| Remove ALL unused images | `docker image prune -a -f` |
| Remove unused volumes | `docker volume prune -f` |
| Remove unused networks | `docker network prune -f` |
| Nuclear cleanup | `docker system prune -a --volumes -f` |

## Diagnostic Commands

| Info | Command |
|---|---|
| Disk usage | `docker system df` |
| Running containers | `docker ps` |
| All containers | `docker ps -a` |
| Container logs | `docker logs <id> --tail 50` |
| Container stats | `docker stats --no-stream` |

## Restart Policies

| Policy | Meaning |
|---|---|
| `no` | Don't restart (default) |
| `on-failure` | Restart on non-zero exit |
| `always` | Always restart |
| `unless-stopped` | Restart unless manually stopped |
