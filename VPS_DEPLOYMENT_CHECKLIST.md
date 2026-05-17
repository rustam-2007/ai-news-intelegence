# VPS Deployment Checklist

## Pre-Deployment Preparation

### System Requirements
- [ ] Ubuntu 22.04 or 24.04 LTS
- [ ] Minimum 2 CPU cores
- [ ] Minimum 4GB RAM
- [ ] Minimum 40GB disk space
- [ ] Root access or sudo privileges
- [ ] SSH access configured

### Required Information
- [ ] GitHub repository URL
- [ ] GitHub personal access token (if private repo)
- [ ] Domain name (optional)
- [ ] SSL certificate path (if using HTTPS)
- [ ] Email for SSL notifications (if using Let's Encrypt)

---

## Step 1: System Setup (Run as root)

### Security & Updates
```bash
# [ ] Update system packages
apt update && apt upgrade -y

# [ ] Set timezone
timedatectl set-timezone UTC

# [ ] Configure system locale
locale-gen en_US.UTF-8
update-locale LANG=en_US.UTF-8
```

### Install Essential Tools
```bash
# [ ] Install essential packages
apt install -y curl git vim htop ufw fail2ban unzip wget

# [ ] Verify installations
docker --version
git --version
vim --version
```

### Docker Installation
```bash
# [ ] Download and install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# [ ] Install Docker Compose plugin
apt install -y docker-compose-plugin

# [ ] Verify Docker installation
docker --version
docker compose version

# [ ] Enable and start Docker
systemctl enable docker
systemctl start docker
```

### Firewall Configuration
```bash
# [ ] Configure UFW firewall
ufw default deny incoming
ufw default allow outgoing

# [ ] Allow necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # Application

# [ ] Enable firewall
ufw --force enable

# [ ] Verify firewall status
ufw status verbose
```

### Security Hardening
```bash
# [ ] Enable fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# [ ] Configure automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# [ ] Secure SSH (edit /etc/ssh/sshd_config)
# PermitRootLogin no
# PasswordAuthentication no
systemctl restart sshd
```

---

## Step 2: User & Directory Setup

### Create Application User
```bash
# [ ] Create application user
useradd -m -s /bin/bash newsint

# [ ] Add user to docker group
usermod -aG docker newsint

# [ ] Set user password (optional)
passwd newsint
```

### Create Application Directory
```bash
# [ ] Create application directory
mkdir -p /opt/news-intelligence

# [ ] Set ownership
chown newsint:newsint /opt/news-intelligence

# [ ] Verify permissions
ls -la /opt/
```

---

## Step 3: Application Deployment

### Switch to Application User
```bash
# [ ] Switch to newsint user
su - newsint
```

### Clone Repository
```bash
# [ ] Navigate to application directory
cd /opt/news-intelligence

# [ ] Clone repository
git clone https://github.com/YOUR_USERNAME/news-intelligence-platform.git .

# [ ] Verify files were cloned
ls -la

# [ ] Check git status
git status
```

### Install Dependencies
```bash
# [ ] Install Node.js dependencies
npm install

# [ ] Verify installation
ls -la node_modules/

# [ ] Check package.json
cat package.json
```

### Configure Environment
```bash
# [ ] Copy environment template
cp .env.example .env

# [ ] Edit environment file
vim .env

# [ ] Verify critical variables:
# [ ] DATABASE_URL - Strong password
# [ ] REDIS_URL - Strong password
# [ ] NODE_ENV - Set to "production"
# [ ] PORT - Set to 3000
# [ ] Add API keys (OpenAI, Telegram, etc.)

# [ ] Secure .env file
chmod 600 .env

# [ ] Verify .env is readable
cat .env
```

---

## Step 4: Database Setup

### Start Database Containers
```bash
# [ ] Start PostgreSQL and Redis
docker compose up -d postgres redis

# [ ] Wait for containers to be healthy
sleep 30

# [ ] Verify containers are running
docker compose ps

# [ ] Check PostgreSQL logs
docker compose logs postgres

# [ ] Check Redis logs
docker compose logs redis
```

### Generate Prisma Client
```bash
# [ ] Generate Prisma Client
npx prisma generate

# [ ] Verify Prisma Client was generated
ls -la node_modules/.prisma/client/

# [ ] Check Prisma version
npx prisma --version
```

### Run Database Migrations
```bash
# [ ] Run migrations in production mode
npx prisma migrate deploy

# [ ] Verify migration was applied
npx prisma migrate status

# [ ] Check database tables
docker exec news_intelligence_postgres psql -U news_intelligence -c "\dt"

# [ ] Verify schema matches
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
```

### Seed Initial Data (Optional)
```bash
# [ ] Create initial admin user (manual)
# npx prisma db seed

# [ ] Verify seeded data
# docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT * FROM users;"
```

---

## Step 5: Application Deployment

### Build and Start Application
```bash
# [ ] Build Docker image
docker compose build api

# [ ] Start API container
docker compose up -d api

# [ ] Wait for application to start
sleep 15

# [ ] Verify all containers are running
docker compose ps

# [ ] Check application logs
docker compose logs api

# [ ] Verify container is healthy
docker ps | grep news_intelligence_api
```

### Verify Health Endpoint
```bash
# [ ] Test health endpoint
curl http://localhost:3000/health

# [ ] Verify response structure
curl -s http://localhost:3000/health | jq .

# [ ] Check all response fields
curl -s http://localhost:3000/health | jq '.status'
# Expected: "ok"

curl -s http://localhost:3000/health | jq '.database'
# Expected: "connected"

curl -s http://localhost:3000/health | jq '.redis'
# Expected: "connected"

curl -s http://localhost:3000/health | jq '.environment'
# Expected: "production"
```

### Test Application Functionality
```bash
# [ ] Test main application endpoint
curl http://localhost:3000/

# [ ] Test API prefix
curl http://localhost:3000/api/

# [ ] Check for CORS headers
curl -I http://localhost:3000/health

# [ ] Test with different methods
curl -X POST http://localhost:3000/health
curl -X PUT http://localhost:3000/health
```

---

## Step 6: Post-Deployment Verification

### System Health Check
```bash
# [ ] Check all containers status
docker compose ps

# [ ] Check system resources
free -h
df -h
htop

# [ ] Check Docker resource usage
docker stats --no-stream

# [ ] Check disk space
df -h /opt/
```

### Database Health Check
```bash
# [ ] Test database connection
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# [ ] Check database size
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT pg_size_pretty(pg_database_size('news_intelligence'));"

# [ ] Check active connections
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT count(*) FROM pg_stat_activity;"

# [ ] Check table counts
docker exec news_intelligence_postgres psql -U newsint_news_intelligence -c "SELECT 'sources' as table_name, count(*) as row_count FROM sources UNION ALL SELECT 'articles', count(*) FROM articles UNION ALL SELECT 'users', count(*) FROM users;"
```

### Redis Health Check
```bash
# [ ] Test Redis connection
docker exec news_intelligence_redis redis-cli ping

# [ ] Check Redis memory usage
docker exec news_intelligence_redis redis-cli info memory

# [ ] Check Redis clients
docker exec news_intelligence_redis redis-cli info clients
```

### Application Logs Review
```bash
# [ ] Review recent application logs
docker compose logs --tail=50 api

# [ ] Check for errors
docker compose logs api | grep -i error

# [ ] Check for warnings
docker compose logs api | grep -i warning

# [ ] Check startup sequence
docker compose logs api | grep -i started
```

---

## Step 7: Security Verification

### Firewall Verification
```bash
# [ ] Check firewall status
ufw status verbose

# [ ] Verify only required ports are open
netstat -tlnp | grep -E ':(22|80|443|3000)'

# [ ] Check for unauthorized services
netstat -tlnp
```

### User Permissions
```bash
# [ ] Verify application user
whoami

# [ ] Check docker group membership
groups

# [ ] Verify file permissions
ls -la /opt/news-intelligence/
```

### Environment Security
```bash
# [ ] Verify .env file permissions
ls -la .env

# [ ] Check .env file is not world-readable
stat -c %a .env
# Expected: 600

# [ ] Verify no secrets in git
git log --all --full-history --source -- "**/.env"
```

---

## Step 8: Monitoring Setup

### Log Rotation Setup
```bash
# [ ] Create logrotate configuration
sudo tee /etc/logrotate.d/news-intelligence > /dev/null << 'EOF'
/opt/news-intelligence/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 newsint newsint
}
EOF

# [ ] Test logrotate configuration
sudo logrotate -d /etc/logrotate.d/news-intelligence
```

### Monitoring Scripts
```bash
# [ ] Create monitoring directory
mkdir -p /opt/news-intelligence/monitoring

# [ ] Create health check script
cat > /opt/news-intelligence/monitoring/health-check.sh << 'EOF'
#!/bin/bash
while true; do
  echo "=== $(date) ==="
  docker compose ps
  curl -s http://localhost:3000/health | jq .
  sleep 60
done
EOF

# [ ] Make script executable
chmod +x /opt/news-intelligence/monitoring/health-check.sh

# [ ] Test monitoring script
timeout 10 /opt/news-intelligence/monitoring/health-check.sh
```

---

## Step 9: Backup Setup

### Initial Database Backup
```bash
# [ ] Create backup directory
mkdir -p /opt/backups/news-intelligence

# [ ] Create initial backup
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > /opt/backups/news-intelligence/initial_backup_$(date +%Y%m%d_%H%M%S).sql

# [ ] Verify backup was created
ls -lh /opt/backups/news-intelligence/

# [ ] Set up backup permissions
chmod 700 /opt/backups/news-intelligence
```

### Automated Backup Setup
```bash
# [ ] Create backup script
cat > /opt/news-intelligence/monitoring/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/news-intelligence"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/news_intelligence_$DATE.sql"

# Create backup
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove backups older than 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

# [ ] Make script executable
chmod +x /opt/news-intelligence/monitoring/backup.sh

# [ ] Add to crontab for daily backups at 2 AM
crontab -l | grep -v backup.sh | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/news-intelligence/monitoring/backup.sh >> /var/log/news-intelligence-backup.log 2>&1") | crontab -
```

---

## Step 10: Final Verification

### Comprehensive Health Check
```bash
# [ ] Run comprehensive health check
curl -s http://localhost:3000/health | jq .

# [ ] Check all containers
docker compose ps

# [ ] Check recent logs
docker compose logs --tail=20 api

# [ ] Check system resources
free -h && df -h

# [ ] Verify database connectivity
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# [ ] Verify Redis connectivity
docker exec news_intelligence_redis redis-cli ping
```

### Documentation
```bash
# [ ] Document deployment details
cat > /opt/news-intelligence/DEPLOYMENT_INFO.txt << 'EOF'
Deployment Date: $(date)
Deployed By: $(whoami)
Git Commit: $(git rev-parse HEAD)
Git Branch: $(git branch --show-current)
Node Version: $(node --version)
npm Version: $(npm --version)
Docker Version: $(docker --version)
Docker Compose Version: $(docker compose version)
Database Host: postgres
Database Port: 5432
Application Port: 3000
EOF

# [ ] Review deployment info
cat /opt/news-intelligence/DEPLOYMENT_INFO.txt
```

### Access Information
```bash
# [ ] Document access details
echo "Application URL: http://YOUR_VPS_IP:3000"
echo "Health Endpoint: http://YOUR_VPS_IP:3000/health"
echo "SSH Access: ssh newsint@YOUR_VPS_IP"
echo "Application Directory: /opt/news-intelligence"
echo "Backup Directory: /opt/backups/news-intelligence"
```

---

## Emergency Contact Information

### Documentation Location
```bash
# [ ] Create emergency documentation
cat > /opt/news-intelligence/EMERGENCY_INFO.txt << 'EOF'
=== EMERGENCY INFORMATION ===

Application: AI News Intelligence Platform
Deployment Directory: /opt/news-intelligence
Backup Directory: /opt/backups/news-intelligence
Application User: newsint

Quick Commands:
  Stop all services: docker compose down
  Start all services: docker compose up -d
  Restart application: docker compose restart api
  View logs: docker compose logs -f api
  Health check: curl http://localhost:3000/health

Database:
  Backup: /opt/news-intelligence/monitoring/backup.sh
  Restore: See DEPLOYMENT_COMMANDS.md

Monitoring:
  Health check: /opt/news-intelligence/monitoring/health-check.sh
  System: htop
  Docker: docker stats

Support Documentation:
  - DEPLOYMENT_COMMANDS.md
  - VERIFICATION_COMMANDS.md
  - ROLLBACK_COMMANDS.md
  - BACKUP_STRATEGY.md
  - MONITORING_COMMANDS.md
EOF

# [ ] Review emergency info
cat /opt/news-intelligence/EMERGENCY_INFO.txt
```

---

## Final Checklist

### Critical Items
- [ ] All containers running and healthy
- [ ] Health endpoint responding correctly
- [ ] Database migrations applied
- [ ] No errors in logs
- [ ] Firewall configured
- [ ] Backups set up
- [ ] Monitoring configured

### Security Items
- [ ] Strong passwords in .env
- [ ] .env file permissions set to 600
- [ ] SSH configured securely
- [ ] Firewall enabled
- [ ] Fail2ban enabled
- [ ] Auto-updates configured

### Documentation Items
- [ ] Deployment info documented
- [ ] Emergency info documented
- [ ] Backup procedures documented
- [ ] Rollback procedures documented

### Performance Items
- [ ] System resources adequate
- [ ] Docker resource limits reasonable
- [ ] Log rotation configured
- [ ] Backup strategy implemented

---

## Deployment Complete

**Status**: ✅ Ready for Production

**Next Steps**:
1. Monitor application for 24 hours
2. Set up external monitoring (optional)
3. Configure domain and SSL (optional)
4. Set up CI/CD pipeline (optional)
5. Begin Phase 2 implementation

**Support Resources**:
- VPS_DEPLOYMENT_COMMANDS.md
- VERIFICATION_COMMANDS.md
- ROLLBACK_COMMANDS.md
- BACKUP_STRATEGY.md
- MONITORING_COMMANDS.md

**Emergency Contacts**:
- System Admin: [YOUR_EMAIL]
- On-call Support: [YOUR_PHONE]