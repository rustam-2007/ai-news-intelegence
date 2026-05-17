# VPS Deployment Guide - Ubuntu 22.04/24.04

Complete production deployment guide for AI News Intelligence Platform on Ubuntu VPS.

## 🚀 Quick Start Commands

### 1. System Setup (Run as root)
```bash
# Update system
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git vim htop ufw

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Add current user to docker group (optional, for non-root usage)
usermod -aG docker $USER

# Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable
```

### 2. Application Setup (Run as your user)
```bash
# Clone repository (replace with your repo URL)
cd /opt
git clone <YOUR_REPO_URL> news-intelligence
cd news-intelligence

# Copy environment file
cp .env.example .env

# Edit .env with production values
vim .env
```

### 3. Start Infrastructure
```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Verify containers are running
docker compose ps

# Check logs
docker compose logs postgres
docker compose logs redis
```

### 4. Database Setup
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations (development mode)
npx prisma migrate dev --name init

# OR for production:
npx prisma migrate deploy

# Verify database schema
npx prisma studio --browser none &
```

### 5. Start Application
```bash
# Option 1: Development mode (inside Docker)
docker compose up -d api

# Option 2: Development mode (local Node.js)
npm run start:dev

# Option 3: Production mode (local Node.js)
npm run build
npm run start:prod

# Verify application is running
curl http://localhost:3000/health
```

---

## 📋 Detailed Steps

### Step 1: System Preparation

```bash
# 1.1 Update system packages
sudo apt update && sudo apt upgrade -y

# 1.2 Install essential tools
sudo apt install -y curl git vim htop ufail2ban

# 1.3 Set timezone (optional but recommended)
sudo timedatectl set-timezone UTC
```

### Step 2: Docker Installation

```bash
# 2.1 Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2.2 Verify Docker installation
docker --version
docker info

# 2.3 Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# 2.4 Verify Docker Compose
docker compose version

# 2.5 Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker

# 2.6 Add user to docker group (optional)
sudo usermod -aG docker $USER
# Log out and back in for this to take effect
```

### Step 3: Security Configuration

```bash
# 3.1 Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Application
sudo ufw --force enable

# 3.2 Verify firewall status
sudo ufw status verbose

# 3.3 Enable fail2ban for SSH protection
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Step 4: Application Deployment

```bash
# 4.1 Create application directory
sudo mkdir -p /opt/news-intelligence
sudo chown $USER:$USER /opt/news-intelligence

# 4.2 Clone your repository
cd /opt/news-intelligence
git clone <YOUR_REPO_URL> .

# 4.3 Install Node.js dependencies
npm install

# 4.4 Set up environment file
cp .env.example .env
vim .env

# 4.5 Important .env variables to update:
# DATABASE_URL - Use strong password
# REDIS_URL - Use strong password if Redis requires auth
# NODE_ENV - Set to "production"
# PORT - Keep 3000 or change as needed
# Add any API keys (OpenAI, Telegram, etc.)
```

### Step 5: Database Setup

```bash
# 5.1 Start PostgreSQL and Redis containers
docker compose up -d postgres redis

# 5.2 Wait for containers to be healthy
docker compose ps

# 5.3 Check logs if needed
docker compose logs postgres
docker compose logs redis

# 5.4 Generate Prisma Client
npx prisma generate

# 5.5 Run database migrations
# For development:
npx prisma migrate dev --name init

# For production:
npx prisma migrate deploy

# 5.6 (Optional) Seed initial data
# npx prisma db seed
```

### Step 6: Application Startup

```bash
# 6.1 Build the application
npm run build

# 6.2 Option 1: Run in Docker (recommended for production)
docker compose up -d api

# 6.3 Option 2: Run with PM2 (recommended for Node.js)
# Install PM2 globally
sudo npm install -g pm2

# Start application with PM2
pm2 start npm --name "news-intelligence" -- start:prod

# Configure PM2 to start on boot
pm2 startup
pm2 save

# 6.4 Option 3: Run directly (not recommended for production)
npm run start:prod
```

### Step 7: Verification

```bash
# 7.1 Check application health
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

# 7.2 Check Docker containers
docker compose ps

# 7.3 Check application logs
docker compose logs -f api

# 7.4 Check PM2 status (if using PM2)
pm2 status
pm2 logs news-intelligence
```

---

## 🔄 Common Operations

### Update Application
```bash
# Pull latest changes
cd /opt/news-intelligence
git pull

# Install new dependencies
npm install

# Run migrations if schema changed
npx prisma migrate deploy

# Rebuild and restart
docker compose up -d --build api

# Or if using PM2:
# npm run build
# pm2 restart news-intelligence
```

### View Logs
```bash
# Docker logs
docker compose logs -f api
docker compose logs -f postgres
docker compose logs -f redis

# PM2 logs
pm2 logs news-intelligence

# System logs
journalctl -u docker -f
```

### Database Management
```bash
# Open Prisma Studio (database GUI)
npx prisma studio --browser none

# Create new migration
npx prisma migrate dev --name describe_changes

# Apply migrations in production
npx prisma migrate deploy

# Reset database (DESTRUCTIVE - only use in development)
npx prisma migrate reset

# Backup database
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > backup.sql

# Restore database
docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence < backup.sql
```

### Restart Services
```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart postgres
docker compose restart redis

# Restart PM2 app
pm2 restart news-intelligence

# Restart Docker service
sudo systemctl restart docker
```

### Stop Services
```bash
# Stop all services
docker compose down

# Stop and remove volumes (DESTRUCTIVE)
docker compose down -v

# Stop PM2 app
pm2 stop news-intelligence

# Stop Docker service
sudo systemctl stop docker
```

---

## 🔒 Security Best Practices

### 1. Database Security
```bash
# Change default database passwords in .env
# Use strong, unique passwords for DATABASE_URL
# Consider using database secrets management

# Restrict database access to localhost only
# In docker-compose.yml, remove "5432:5432" port mapping
```

### 2. Redis Security
```bash
# Enable Redis password authentication
# In docker-compose.yml, add: command: redis-server --requirepass your_strong_password

# Update REDIS_URL in .env:
# REDIS_URL=redis://:your_strong_password@redis:6379
```

### 3. Application Security
```bash
# Use environment variables for all secrets
# Never commit .env file to repository
# Regularly update dependencies: npm audit fix
# Use HTTPS in production (set up reverse proxy)
```

### 4. System Security
```bash
# Keep system updated
sudo apt update && sudo apt upgrade -y

# Use SSH keys instead of passwords
# Disable root SSH login
# Set up automatic security updates
```

---

## 📊 Monitoring

### System Monitoring
```bash
# Check system resources
htop

# Check disk usage
df -h

# Check memory usage
free -h

# Check Docker resource usage
docker stats
```

### Application Monitoring
```bash
# Check application logs
docker compose logs -f api --tail=100

# Check PM2 monitoring
pm2 monit

# Check health endpoint
curl http://localhost:3000/health
```

### Database Monitoring
```bash
# Check PostgreSQL connections
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT count(*) FROM pg_stat_activity;"

# Check database size
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT pg_size_pretty(pg_database_size('news_intelligence'));"
```

---

## 🐛 Troubleshooting

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

### Out of Memory
```bash
# Check memory usage
free -h

# Check Docker memory usage
docker stats

# Restart services
docker compose restart

# Consider upgrading VPS resources
```

---

## 📝 Environment Variables Reference

### Required Variables
```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Redis
REDIS_URL="redis://host:6379"

# Application
NODE_ENV="production"
PORT=3000
```

### Optional Variables (for future phases)
```env
# OpenAI API
OPENAI_API_KEY="sk-..."

# Telegram Bot
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHANNEL_ID="@channel"

# Admin User
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="secure_password"
ADMIN_USERNAME="admin"

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=100

# Queue Settings
QUEUE_CONCURRENT_JOBS=3
QUEUE_JOB_TIMEOUT=60000

# Logging
LOG_LEVEL="info"
```

---

## 🎯 Production Checklist

- [ ] System updated and secured
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured
- [ ] Strong passwords set in .env
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

---

## 📞 Support

For issues or questions:
1. Check application logs: `docker compose logs -f api`
2. Check system logs: `journalctl -xe`
3. Verify all containers are running: `docker compose ps`
4. Test health endpoint: `curl http://localhost:3000/health`
5. Review troubleshooting section above