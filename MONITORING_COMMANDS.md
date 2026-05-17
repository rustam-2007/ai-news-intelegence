# Monitoring Commands

## Docker Container Monitoring

### Container Status
```bash
# Check all containers status
docker compose ps

# Detailed container information
docker compose ps -a

# Container resource usage
docker stats --no-stream

# Real-time resource monitoring
docker stats
```

### Container Logs
```bash
# Real-time logs (all services)
docker compose logs -f

# Real-time logs (specific service)
docker compose logs -f api
docker compose logs -f postgres
docker compose logs -f redis

# Last N lines
docker compose logs --tail=50 api

# Logs with timestamps
docker compose logs -t api

# Logs since specific time
docker compose logs --since 2024-01-17T10:00:00 api

# Logs with grep filtering
docker compose logs api | grep -i error
docker compose logs api | grep -i warning
docker compose logs api | grep -i started
```

### Container Health
```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}"

# Detailed health information
docker inspect --format='{{json .State.Health}}' news_intelligence_api | jq .

# Health check history
docker inspect --format='{{json .State.Health.Log}}' news_intelligence_api | jq .
```

### Container Inspection
```bash
# Detailed container information
docker inspect news_intelligence_api

# Container network settings
docker inspect --format='{{json .NetworkSettings}}' news_intelligence_api | jq .

# Container mount points
docker inspect --format='{{json .Mounts}}' news_intelligence_api | jq .

# Container environment variables
docker inspect --format='{{json .Config.Env}}' news_intelligence_api | jq .
```

---

## Docker Resource Monitoring

### System Resources
```bash
# Docker system overview
docker system df

# Docker system events
docker events --since 1h

# Docker disk usage
docker system df -v

# Docker resource cleanup
docker system prune -a
```

### Container Resources
```bash
# Live resource monitoring
docker stats news_intelligence_api news_intelligence_postgres news_intelligence_redis

# Resource usage without stream
docker stats --no-stream news_intelligence_api

# Resource usage with custom format
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Container resource limits
docker inspect --format='{{.HostConfig.Memory}}' news_intelligence_api
docker inspect --format='{{.HostConfig.NanoCpus}}' news_intelligence_api
```

### Volume Monitoring
```bash
# List volumes
docker volume ls

# Volume details
docker volume inspect news_intelligence_postgres_data

# Volume usage
docker system df -v | grep volume

# Volume cleanup
docker volume prune
```

### Network Monitoring
```bash
# Network statistics
docker network ls

# Network details
docker network inspect news_intelligence_news_intelligence_network

# Container network connections
docker exec news_intelligence_api netstat -tlnp
```

---

## Application Health Monitoring

### Health Endpoint Checks
```bash
# Basic health check
curl http://localhost:3000/health

# Verbose output
curl -v http://localhost:3000/health

# Pretty-print JSON
curl http://localhost:3000/health | jq .

# Check specific fields
curl -s http://localhost:3000/health | jq '.status'
curl -s http://localhost:3000/health | jq '.database'
curl -s http://localhost:3000/health | jq '.redis'
curl -s http://localhost:3000/health | jq '.uptime'
curl -s http://localhost:3000/health | jq '.environment'
```

### Health Endpoint Monitoring
```bash
# Continuous health monitoring
while true; do
  STATUS=$(curl -s http://localhost:3000/health | jq -r '.status')
  UPTIME=$(curl -s http://localhost:3000/health | jq -r '.uptime')
  echo "$(date): Status=$STATUS, Uptime=$UPTIME"
  sleep 60
done

# Health check with alerts
while true; do
  STATUS=$(curl -s http://localhost:3000/health | jq -r '.status')
  if [ "$STATUS" != "ok" ]; then
    echo "ALERT: Application unhealthy - $(date)"
    # Send alert notification
  fi
  sleep 30
done
```

### Response Time Monitoring
```bash
# Measure response time
time curl http://localhost:3000/health

# Response time with details
curl -w "\nTime: %{time_total}s\n" -o /dev/null -s http://localhost:3000/health

# Continuous response time monitoring
while true; do
  RESPONSE_TIME=$(curl -w "%{time_total}" -o /dev/null -s http://localhost:3000/health)
  echo "$(date): Response time = ${RESPONSE_TIME}s"
  sleep 60
done
```

### Application Logs Monitoring
```bash
# Real-time application logs
docker compose logs -f api

# Logs with error filtering
docker compose logs api | grep -i error

# Logs with warning filtering
docker compose logs api | grep -i warning

# Count errors in last hour
docker compose logs --since 1h api | grep -i error | wc -l

# Find recent errors
docker compose logs --since 30m api | grep -i error
```

---

## Database Monitoring

### PostgreSQL Health
```bash
# Check PostgreSQL is ready
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# Check PostgreSQL version
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT version();"

# Check active connections
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT count(*) FROM pg_stat_activity;"

# Check database size
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT pg_size_pretty(pg_database_size('news_intelligence'));"

# Check table sizes
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### PostgreSQL Performance
```bash
# Slow queries
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Lock monitoring
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT pid, usename, query, state FROM pg_stat_activity WHERE datname = 'news_intelligence' AND state != 'idle';"

# Table row counts
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT 'sources' as table_name, count(*) as row_count FROM sources UNION ALL SELECT 'articles', count(*) FROM articles UNION ALL SELECT 'users', count(*) FROM users;"

# Index usage
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT 10;"
```

### PostgreSQL Logs
```bash
# PostgreSQL logs
docker compose logs postgres

# PostgreSQL error logs
docker compose logs postgres | grep -i error

# PostgreSQL connection logs
docker compose logs postgres | grep -i connection

# Real-time PostgreSQL monitoring
docker compose logs -f postgres
```

---

## Redis Monitoring

### Redis Health
```bash
# Check Redis is running
docker exec news_intelligence_redis redis-cli ping

# Redis info
docker exec news_intelligence_redis redis-cli info

# Redis server info
docker exec news_intelligence_redis redis-cli info server

# Redis memory info
docker exec news_intelligence_redis redis-cli info memory

# Redis stats
docker exec news_intelligence_redis redis-cli info stats
```

### Redis Performance
```bash
# Connected clients
docker exec news_intelligence_redis redis-cli client list

# Memory usage
docker exec news_intelligence_redis redis-cli info memory | grep used_memory_human

# Key count
docker exec news_intelligence_redis redis-cli dbsize

# Slow log
docker exec news_intelligence_redis redis-cli slowlog get 10

# Command stats
docker exec news_intelligence_redis redis-cli info commandstats
```

### Redis Logs
```bash
# Redis logs
docker compose logs redis

# Redis error logs
docker compose logs redis | grep -i error

# Real-time Redis monitoring
docker compose logs -f redis
```

---

## System Resource Monitoring

### CPU Monitoring
```bash
# CPU usage
top -b -n1 | head -20

# CPU usage per core
mpstat 1 1

# CPU usage by process
ps aux --sort=-%cpu | head -10

# Docker CPU usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}"
```

### Memory Monitoring
```bash
# Memory usage
free -h

# Memory usage by process
ps aux --sort=-%mem | head -10

# Docker memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Memory details
cat /proc/meminfo
```

### Disk Monitoring
```bash
# Disk usage
df -h

# Disk usage by directory
du -sh /opt/news-intelligence/*

# Disk I/O
iostat -x 1 1

# Docker disk usage
docker system df
```

### Network Monitoring
```bash
# Network connections
netstat -tlnp

# Network statistics
netstat -i

# Docker network stats
docker stats --no-stream --format "table {{.Name}}\t{{.NetIO}}"

# Bandwidth usage
iftop
```

---

## Application Monitoring

### Application Process
```bash
# Check if application is running
ps aux | grep node

# Process details
ps aux | grep "node dist/main"

# Process resource usage
top -p $(pgrep -f "node dist/main")

# Process tree
pstree -p $(pgrep -f "node dist/main")
```

### Application Performance
```bash
# Load testing
ab -n 1000 -c 10 http://localhost:3000/health

# Response time distribution
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# Create curl-format.txt:
# time_namelookup:  %{time_namelookup}\n
# time_connect:     %{time_connect}\n
# time_appconnect:  %{time_appconnect}\n
# time_pretransfer: %{time_pretransfer}\n
# time_starttransfer: %{time_starttransfer}\n
# time_total:       %{time_total}\n
```

### Application Errors
```bash
# Count recent errors
docker compose logs --since 1h api | grep -i error | wc -l

# Find error patterns
docker compose logs api | grep -i "error\|exception\|failed" | tail -20

# Error frequency
for i in {1..24}; do
  COUNT=$(docker compose logs --since "${i}h" --until "$((i-1))h" api | grep -i error | wc -l)
  echo "$((i-1))-${i}h ago: $COUNT errors"
done
```

---

## Comprehensive Monitoring Script

### Create Monitoring Dashboard
```bash
cat > /opt/news-intelligence/monitoring/dashboard.sh << 'EOF'
#!/bin/bash

clear
echo "=========================================="
echo "   News Intelligence Platform Monitor"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# System Status
echo "=== SYSTEM STATUS ==="
echo "CPU: $(top -b -n1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)% used"
echo "Memory: $(free | grep Mem | awk '{printf "%.1f/%.1fGB (%.1f%%)", $3/1024, $2/1024, $3*100/$2}')"
echo "Disk: $(df -h /opt | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')"
echo ""

# Docker Status
echo "=== DOCKER CONTAINERS ==="
docker compose ps
echo ""

# Application Health
echo "=== APPLICATION HEALTH ==="
HEALTH=$(curl -s http://localhost:3000/health)
if [ $? -eq 0 ]; then
    echo "Status: $(echo $HEALTH | jq -r '.status')"
    echo "Uptime: $(echo $HEALTH | jq -r '.uptime') seconds"
    echo "Database: $(echo $HEALTH | jq -r '.database')"
    echo "Redis: $(echo $HEALTH | jq -r '.redis')"
else
    echo "❌ Application is not responding"
fi
echo ""

# Database Status
echo "=== DATABASE STATUS ==="
DB_READY=$(docker exec news_intelligence_postgres pg_isready -U news_intelligence 2>/dev/null)
if [ "$DB_READY" = "accepting connections" ]; then
    echo "PostgreSQL: ✅ Running"
    DB_SIZE=$(docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT pg_size_pretty(pg_database_size('news_intelligence'));" -t | xargs)
    echo "Database Size: $DB_SIZE"
    DB_CONNECTIONS=$(docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT count(*) FROM pg_stat_activity;" -t | xargs)
    echo "Active Connections: $DB_CONNECTIONS"
else
    echo "❌ PostgreSQL is not running"
fi
echo ""

# Redis Status
echo "=== REDIS STATUS ==="
REDIS_PING=$(docker exec news_intelligence_redis redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
    echo "Redis: ✅ Running"
    REDIS_MEMORY=$(docker exec news_intelligence_redis redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo "Memory Usage: $REDIS_MEMORY"
    REDIS_CLIENTS=$(docker exec news_intelligence_redis redis-cli info clients | grep connected_clients | cut -d: -f2 | tr -d '\r')
    echo "Connected Clients: $REDIS_CLIENTS"
else
    echo "❌ Redis is not running"
fi
echo ""

# Recent Errors
echo "=== RECENT ERRORS (Last Hour) ==="
ERROR_COUNT=$(docker compose logs --since 1h api 2>/dev/null | grep -i error | wc -l)
if [ $ERROR_COUNT -gt 0 ]; then
    echo "⚠️  $ERROR_COUNT errors found"
    docker compose logs --since 1h api 2>/dev/null | grep -i error | tail -3
else
    echo "✅ No errors in the last hour"
fi
echo ""

# Disk Space
echo "=== DISK SPACE ==="
df -h /opt | tail -1 | awk '{print "Used: "$3 " / "$5 " (" $6 ")"}'
echo ""

echo "=========================================="
echo "Press Ctrl+C to exit, refreshes every 30s"
echo "=========================================="
EOF

chmod +x /opt/news-intelligence/monitoring/dashboard.sh

# Run monitoring dashboard
/opt/news-intelligence/monitoring/dashboard.sh
```

### Create Alert Script
```bash
cat > /opt/news-intelligence/monitoring/alert.sh << 'EOF'
#!/bin/bash

ALERT_EMAIL="admin@yourdomain.com"
LOG_FILE="/var/log/news-intelligence-alerts.log"

send_alert() {
    SUBJECT="ALERT: $1"
    MESSAGE="$2"
    echo "[$(date)] $SUBJECT: $MESSAGE" >> $LOG_FILE
    
    # Send email (configure mail command first)
    # echo "$MESSAGE" | mail -s "$SUBJECT" $ALERT_EMAIL
    
    echo "ALERT: $SUBJECT"
    echo "$MESSAGE"
}

# Check application health
HEALTH=$(curl -s http://localhost:3000/health)
if [ $? -ne 0 ]; then
    send_alert "Application Down" "Health check failed at $(date)"
fi

# Check database
DB_READY=$(docker exec news_intelligence_postgres pg_isready -U news_intelligence 2>/dev/null)
if [ "$DB_READY" != "accepting connections" ]; then
    send_alert "Database Down" "PostgreSQL is not accepting connections at $(date)"
fi

# Check Redis
REDIS_PING=$(docker exec news_intelligence_redis redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" != "PONG" ]; then
    send_alert "Redis Down" "Redis is not responding at $(date)"
fi

# Check for errors
ERROR_COUNT=$(docker compose logs --since 10m api 2>/dev/null | grep -i error | wc -l)
if [ $ERROR_COUNT -gt 10 ]; then
    send_alert "High Error Rate" "$ERROR_COUNT errors in last 10 minutes at $(date)"
fi

# Check disk space
DISK_USAGE=$(df -h /opt | tail -1 | awk '{print $5}' | tr -d '%')
if [ $DISK_USAGE -gt 80 ]; then
    send_alert "Low Disk Space" "Disk usage is ${DISK_USAGE}% at $(date)"
fi

# Check memory
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3*100/$2}')
if [ $MEMORY_USAGE -gt 90 ]; then
    send_alert "High Memory Usage" "Memory usage is ${MEMORY_USAGE}% at $(date)"
fi
EOF

chmod +x /opt/news-intelligence/monitoring/alert.sh

# Add to crontab for every 5 minutes
# crontab -l | grep -v alert.sh | crontab -
# (crontab -l 2>/dev/null; echo "*/5 * * * * /opt/news-intelligence/monitoring/alert.sh >> /var/log/news-intelligence-alerts.log 2>&1") | crontab -
```

---

## Monitoring Schedule

### Continuous Monitoring
```bash
# Run monitoring dashboard continuously
watch -n 30 /opt/news-intelligence/monitoring/dashboard.sh

# Run health checks continuously
while true; do
    curl -s http://localhost:3000/health | jq .
    sleep 30
done
```

### Scheduled Monitoring
```bash
# Add to crontab:
# Every 5 minutes: health check
*/5 * * * * curl -s http://localhost:3000/health | jq . >> /var/log/health-check.log

# Every hour: full status check
0 * * * * /opt/news-intelligence/monitoring/dashboard.sh >> /var/log/status-check.log

# Every 6 hours: disk space check
0 */6 * * * df -h >> /var/log/disk-space.log

# Daily: full system check
0 6 * * * /opt/news-intelligence/monitoring/alert.sh >> /var/log/daily-check.log
```

---

## Remote Monitoring

### Setup Remote Monitoring
```bash
# Install monitoring tools
apt install -y htop iotop nethogs

# Expose monitoring endpoint (only in trusted networks)
# Add to docker-compose.yml:
# ports:
#   - "3000:3000"
#   - "9100:9100"  # metrics (optional)

# Set up basic auth for monitoring
# Use reverse proxy (nginx/caddy) with authentication
```

### External Monitoring Services
```bash
# Uptime monitoring services
# - UptimeRobot (free)
# - Pingdom
# - StatusCake

# Application Performance Monitoring (APM)
# - New Relic
# - Datadog
# - AppSignal

# Log aggregation
# - Loggly
# - Papertrail
# - Logentries
```

---

## Monitoring Best Practices

### Do's
- ✅ Monitor all critical services
- ✅ Set up alerts for failures
- ✅ Log monitoring activities
- ✅ Review logs regularly
- ✅ Test monitoring procedures
- ✅ Document monitoring setup
- ✅ Monitor resource trends
- ✅ Set up automated responses
- ✅ Keep monitoring documentation updated
- ✅ Monitor backup success

### Don'ts
- ❌ Ignore monitoring alerts
- ❌ Skip log review
- ❌ Monitor only application
- ❌ Forget to monitor database
- ❌ Ignore resource trends
- ❌ Skip monitoring tests
- ❌ Forget to monitor backups
- ❌ Monitor only during business hours
- ❌ Ignore slow degradations
- ❌ Forget to update monitoring tools

---

## Monitoring Summary

### Current Monitoring Setup
- **Health Checks**: Every 30 seconds (manual), 5 minutes (automated)
- **Resource Monitoring**: Continuous (dashboard), Hourly (scheduled)
- **Error Monitoring**: Every 10 minutes, alerts on threshold
- **Database Monitoring**: Health checks, performance metrics
- **Log Monitoring**: Real-time, error filtering, alerting
- **Backup Monitoring**: Automated verification, size monitoring

### Monitoring Tools Available
- **docker compose**: Container status and logs
- **docker stats**: Resource monitoring
- **curl**: Health endpoint monitoring
- **htop**: System resources
- **Custom scripts**: Dashboard and alerts

### Monitoring Procedures Documented
- [ ] Docker container monitoring
- [ ] Application health monitoring
- [ ] Database performance monitoring
- [ ] Redis performance monitoring
- [ ] System resource monitoring
- [ ] Error monitoring and alerting
- [ ] Log monitoring procedures
- [ ] Backup monitoring
- [ ] Remote monitoring setup
- [ ] Emergency procedures

**Monitoring commands fully documented and ready for deployment.**