# Docker Installation - Minimal WSL + Docker Engine

Lightweight setup without Docker Desktop using WSL2 + Docker Engine in Debian.

---

## Part 1: Install WSL Minimal

### Enable WSL Features

**PowerShell as Administrator:**

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
shutdown /r /t 0
```

### Install WSL Kernel

After restart:

```powershell
wsl --update
wsl --version
```

### Install Debian

```powershell
wsl --install -d Debian
```

Create username and password when prompted.

**Verify:**
```powershell
wsl --list --verbose
```

---

## Part 2: Install Docker Engine in Debian

### Enter Debian

```powershell
wsl -d Debian
```

### Install Prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
```

### Add Docker Repository

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### Install Docker

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Enable Without Sudo

```bash
sudo usermod -aG docker $USER
exit
```

Re-enter:
```powershell
wsl -d Debian
```

### Start Docker

```bash
sudo service docker start
docker run hello-world
```

---

## Part 3: Run Your Project

### Navigate to Project

```bash
cd /mnt/d/Coding/Project/mind-app/backend
```

### Configure Environment

```bash
cp .env.example .env
nano .env
```

Add your credentials, then save (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Start Services

```bash
sudo service docker start
docker compose up --build
```

### Access Services

From Windows browser:
- Node.js API: http://localhost:4000/health
- Python Service: http://localhost:5000/health

---

## Common Commands

```bash
# Start Docker
sudo service docker start

# Start services (background)
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild
docker compose up --build
```

---

## Auto-Start Docker

Add to `~/.bashrc`:

```bash
if ! service docker status > /dev/null 2>&1; then
    sudo service docker start > /dev/null 2>&1
fi
```

Apply:
```bash
source ~/.bashrc
```

---

## Troubleshooting

**Docker daemon not running:**
```bash
sudo service docker start
```

**Permission denied:**
```bash
sudo usermod -aG docker $USER
exit
wsl -d Debian
```

**Port in use:**
```bash
sudo lsof -i :4000
sudo kill -9 <PID>
```

---

## Quick Reference

```bash
wsl -d Debian                                    # Enter WSL
cd /mnt/d/Coding/Project/mind-app/backend       # Navigate
sudo service docker start                        # Start Docker
docker compose up -d                             # Start services
docker compose logs -f                           # View logs
docker compose down                              # Stop services
```
