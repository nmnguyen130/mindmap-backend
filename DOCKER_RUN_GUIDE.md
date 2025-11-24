# Docker Run Guide

Quick guide to run the Mindmap backend with Docker Desktop.

## Prerequisites

- Docker Desktop installed and running
- `.env` file configured (copy from `.env.example`)

## Quick Start

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Build and start**
   ```bash
   docker compose up --build
   ```

3. **Verify services**
   - Node.js API: http://localhost:4000/health
   - Python service: http://localhost:5000/health

## Common Commands

### Start/Stop
```bash
# Start in foreground
docker compose up

# Start in background
docker compose up -d

# Stop services
docker compose down

# Rebuild and start
docker compose up --build
```

### Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f nodejs-api
docker compose logs -f python-service
```

### Restart
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart nodejs-api
```

## Troubleshooting

### Port already in use
```bash
# Stop conflicting container
docker compose down

# Or change port in docker-compose.yml
```

### Container keeps restarting
```bash
# Check logs for errors
docker compose logs nodejs-api

# Common issues:
# - Missing .env variables
# - Invalid API keys
# - Network issues
```

### Clean rebuild
```bash
# Remove everything and rebuild
docker compose down --rmi all -v
docker compose up --build
```

## Development Workflow

**Making changes:**
- Node.js code changes require restart: `docker compose restart nodejs-api`
- Python changes require rebuild: `docker compose up --build python-service`

**View logs in real-time:**
```bash
docker compose logs -f nodejs-api
```

## Next Steps

Once running, check the [README.md](README.md) for API documentation and testing endpoints.
