# Ubuntu VPS Deployment Commands

## Complete Deployment Workflow

### Step 1: System Setup (Run as root)

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git vim htop ufw fail2ban

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Verify Docker installation
docker --version
docker compose version

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # Application
ufw --force enable

# Verify firewall status
ufw status verbose

# Enable fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Set timezone (optional)
timedatectl set-timezone UTC
```

### Step 2: User Setup (Run as root)

```bash
# Create application user (if not exists)
useradd -m -s /bin/bash newsint

# Add user to docker group
usermod -aG docker newsint

# Switch to application user
su - newsint
```

### Step 3: Application Deployment (Run as newsint user)

```bash
# Create application directory
sudo mkdir -p /opt/news-intelligence
sudo chown newsint:newsint /opt/news-intelligence
cd /opt/news-intelligence

# Clone repository
git clone https://github.com/YOUR_USERNAME/news-intelligence-platform.git .

# OR if repository is private:
# git clone https://github.com/YOUR_USERNAME/news-intelligence-platform.git .
# # You'll need to set up SSH keys or use personal access token

# Verify files
ls -la

# Install Node.js dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with production values
vim .env

# Important variables to update:
# DATABASE_URL - Use strong password
# REDIS_URL - Use strong password if Redis requires auth
# NODE_ENV - Set to "production"
# Add any API keys (OpenAI, Telegram, etc.)
```

### Step 4: Database Setup

```bash
# Start PostgreSQL and Redis containers
docker compose up -d postgres redis

# Wait for containers to be healthy
sleep 30

# Verify containers are running
docker compose ps

# Check PostgreSQL logs
docker compose logs postgres

# Check Redis logs
docker compose logs redis

# Generate Prisma Client
npx prisma generate

# Run database migrations (production mode)
npx prisma migrate deploy

# Verify schema
npx prisma studio --browser none &
# Press Ctrl+C to exit after verification
```

### Step 5: Application Deployment

```bash
# Build and start API container
docker compose up -d --build api

# Wait for application to start
sleep 15

# Verify all containers are running
docker compose ps

# Check application logs
docker compose logs api

# Verify health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2024-01-17T10:30:00.000Z",
#   "uptime": 123.456,
#   "database": "connected",
#   "redis": "connected",
#   "version": "1.0.0",
#   "environment": "production"
# }
```

### Step 6: Post-Deployment Verification

```bash
# Check all services status
docker compose ps

# Check application logs
docker compose logs -f api --tail=50

# Test health endpoint
curl -v http://localhost:3000/health

# Check database connectivity
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# Check Redis connectivity
docker exec news_intelligence_redis redis-cli ping

# Check system resources
htop
df -h
free -h
```

## Common Deployment Operations

### Update Application
```bash
cd /opt/news-intelligence

# Pull latest changes
git pull

# Install new dependencies
npm install

# Run migrations if schema changed
npx prisma migrate deploy

# Rebuild and restart
docker compose up -d --build api

# Verify application is running
curl http://localhost:3000/health
```

### Restart Services
```bash
cd /opt/news-intelligence

# Restart all services
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart postgres
docker compose restart redis

# Restart Docker service
sudo systemctl restart docker
```

### View Logs
```bash
cd /opt/news-intelligence

# Real-time logs
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100 api

# All services logs
docker compose logs

# Specific service logs
docker compose logs postgres
docker compose logs redis
```

### Database Backup
```bash
cd /opt/news-intelligence

# Create backup
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence < backup_20240117_103000.sql
```

### Stop Services
```bash
cd /opt/news-intelligence

# Stop all services
docker compose down

# Stop and remove volumes (DESTRUCTIVE)
docker compose down -v
```

## Troubleshooting

### Container Won't Start
```bash
# Check container status
docker compose ps

# Check container logs
docker compose logs api

# Restart container
docker compose restart api

# Rebuild container
docker compose up -d --build api

# Check system resources
df -h
free -h
docker stats
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Test database connection
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT 1;"

# Regenerate Prisma Client
npx prisma generate

# Reset database (DESTRUCTIVE - only use in development)
npx prisma migrate reset
```

### Port Already in Use
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process (replace <PID> with actual PID)
sudo kill -9 <PID>

# Or use fuser
sudo fuser -k 3000/tcp
```

### Permission Issues
```bash
# Fix ownership issues
sudo chown -R newsint:newsint /opt/news-intelligence

# Fix Docker permissions
sudo usermod -aG docker newsint
# Log out and log back in
```

## Security Hardening

### Secure SSH
```bash
# Edit SSH configuration
sudo vim /etc/ssh/sshd_config

# Recommended settings:
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes

# Restart SSH service
sudo systemctl restart sshd

# Set up SSH keys
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
cat ~/.ssh/id_rsa.pub
# Add to GitHub/GitLab
```

### Configure Automatic Security Updates
```bash
# Install unattended-upgrades
sudo apt install -y unattended-upgrades

# Configure automatic updates
sudo dpkg-reconfigure -plow unattended-upgrades

# Enable service
sudo systemctl enable unattended-upgrades
```

### Set Up Log Rotation
```bash
# Create logrotate configuration
sudo vim /etc/logrotate.d/news-intelligence

# Add this content:
# /opt/news-intelligence/logs/*.log {
#     daily
#     missingok
#     rotate 14
#     compress
#     delaycompress
#     notifempty
#     create 0640 newsint newsint
# }
```

## Monitoring Setup

### Basic Monitoring Script
```bash
# Create monitoring script
vim ~/monitor.sh

# Add this content:
#!/bin/bash
while true; do
  echo "=== $(date) ==="
  docker compose ps
  curl -s http://localhost:3000/health | jq .
  sleep 60
done

# Make executable
chmod +x ~/monitor.sh

# Run in background
nohup ~/monitor.sh > ~/monitor.log 2>&1 &
```

### System Monitoring
```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# Real-time monitoring
htop              # CPU and memory
iotop             # Disk I/O
nethogs           # Network usage
docker stats       # Container stats
```

## Production Checklist

- [ ] System updated and secured
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured (ufw)
- [ ] SSH keys configured
- [ ] Application user created
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] .env configured with strong passwords
- [ ] Database migrations applied
- [ ] Application built and running
- [ ] Health endpoint responding
- [ ] Log rotation configured
- [ ] Backup strategy in place
- [ ] Monitoring set up
- [ ] HTTPS configured (using Nginx/Caddy)
- [ ] SSL certificates obtained
- [ ] Domain configured
- [ ] DNS records updated

## Emergency Procedures

### Full System Restart
```bash
# Restart all services
cd /opt/news-intelligence
docker compose down
docker compose up -d

# Or restart entire system (requires root)
sudo reboot
```

### Restore from Backup
```bash
# Stop application
cd /opt/news-intelligence
docker compose down

# Restore database
docker compose up -d postgres
sleep 10
docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence < backup_20240117_103000.sql

# Start application
docker compose up -d

# Verify
curl http://localhost:3000/health
```

### Rollback to Previous Version
```bash
cd /opt/news-intelligence

# Check git history
git log --oneline

# Checkout previous version
git checkout <commit_hash>

# Rebuild and deploy
npm install
docker compose up -d --build api

# Verify
curl http://localhost:3000/health
```