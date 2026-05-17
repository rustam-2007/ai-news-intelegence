# PostgreSQL Backup Strategy

## Backup Overview

### Backup Types
1. **Full Database Backups** - Complete database dumps
2. **Incremental Backups** - Changes since last backup
3. **Automated Backups** - Scheduled daily backups
4. **Manual Backups** - On-demand before major changes
5. **Migration Backups** - Before database schema changes

### Retention Policy
- Daily backups: Keep for 7 days
- Weekly backups: Keep for 4 weeks
- Monthly backups: Keep for 12 months
- Migration backups: Keep indefinitely

---

## Backup Storage

### Local Storage
```bash
# Create backup directory structure
mkdir -p /opt/backups/news-intelligence/{daily,weekly,monthly,migrations}

# Set permissions
chmod 700 /opt/backups/news-intelligence
chown -R newsint:newsint /opt/backups/news-intelligence

# Verify structure
ls -la /opt/backups/news-intelligence/
```

### Remote Storage (Optional)
```bash
# Setup AWS S3 for offsite backups
# Install AWS CLI
apt install -y awscli

# Configure AWS credentials
aws configure

# Create S3 bucket
aws s3 mb s3://news-intelligence-backups

# Test S3 access
aws s3 ls s3://news-intelligence-backups
```

---

## Automated Backup Script

### Create Backup Script
```bash
cat > /opt/news-intelligence/scripts/backup.sh << 'EOF'
#!/bin/bash

# =====================================================
# News Intelligence Platform - Automated Backup Script
# =====================================================

# Configuration
BACKUP_DIR="/opt/backups/news-intelligence"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/daily/news_intelligence_$DATE.sql"
CONTAINER_NAME="news_intelligence_postgres"
DB_USER="news_intelligence"
DB_NAME="news_intelligence"

# S3 Configuration (optional)
S3_BUCKET="s3://news-intelligence-backups"
S3_ENABLED=false

# Logging
LOG_FILE="/var/log/news-intelligence-backup.log"

# =====================================================
# Functions
# =====================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $1" | tee -a "$LOG_FILE"
}

# =====================================================
# Backup Process
# =====================================================

log "Starting backup process..."

# Check if PostgreSQL container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    error "PostgreSQL container is not running"
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR/daily"

# Perform database backup
log "Creating database backup..."
docker exec $CONTAINER_NAME pg_dump -U $DB_USER $DB_NAME > "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    error "Database backup failed"
fi

# Compress backup
log "Compressing backup..."
gzip "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    error "Backup compression failed"
fi

COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Get backup size
BACKUP_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
success "Backup completed: $COMPRESSED_FILE ($BACKUP_SIZE)"

# Upload to S3 (if enabled)
if [ "$S3_ENABLED" = true ]; then
    log "Uploading backup to S3..."
    aws s3 cp "$COMPRESSED_FILE" "$S3_BUCKET/daily/"
    
    if [ $? -ne 0 ]; then
        error "S3 upload failed"
    fi
    
    success "Backup uploaded to S3"
fi

# Clean old backups (keep last 7 days)
log "Cleaning old daily backups..."
find "$BACKUP_DIR/daily" -name "*.sql.gz" -mtime +7 -delete

# Create weekly backup (on Sunday)
if [ $(date +%u) -eq 7 ]; then
    log "Creating weekly backup..."
    cp "$COMPRESSED_FILE" "$BACKUP_DIR/weekly/"
    
    # Clean old weekly backups (keep last 4 weeks)
    find "$BACKUP_DIR/weekly" -name "*.sql.gz" -mtime +28 -delete
    
    success "Weekly backup completed"
fi

# Create monthly backup (on 1st of month)
if [ $(date +%d) -eq 01 ]; then
    log "Creating monthly backup..."
    cp "$COMPRESSED_FILE" "$BACKUP_DIR/monthly/"
    
    # Clean old monthly backups (keep last 12 months)
    find "$BACKUP_DIR/monthly" -name "*.sql.gz" -mtime +365 -delete
    
    success "Monthly backup completed"
fi

# Verify backup integrity
log "Verifying backup integrity..."
if gzip -t "$COMPRESSED_FILE" 2>/dev/null; then
    success "Backup integrity verified"
else
    error "Backup integrity check failed"
fi

# Calculate backup statistics
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

log "Backup statistics: $BACKUP_COUNT backups, total size: $TOTAL_SIZE"

success "Backup process completed successfully"

exit 0
EOF

# Make script executable
chmod +x /opt/news-intelligence/scripts/backup.sh

# Create scripts directory if it doesn't exist
mkdir -p /opt/news-intelligence/scripts
```

---

## Schedule Automated Backups

### Configure Cron Job
```bash
# Add to crontab for daily backups at 2 AM
crontab -l | grep -v backup.sh | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/news-intelligence/scripts/backup.sh >> /var/log/news-intelligence-backup.log 2>&1") | crontab -

# Verify crontab
crontab -l
```

### Create Cron Job for Different Schedules
```bash
# Daily backup at 2 AM
0 2 * * * /opt/news-intelligence/scripts/backup.sh >> /var/log/news-intelligence-backup.log 2>&1

# Weekly backup on Sunday at 3 AM (additional full backup)
0 3 * * 0 /opt/news-intelligence/scripts/backup-weekly.sh >> /var/log/news-intelligence-backup-weekly.log 2>&1

# Monthly backup on 1st at 4 AM (additional full backup)
0 4 1 * * /opt/news-intelligence/scripts/backup-monthly.sh >> /var/log/news-intelligence-backup-monthly.log 2>&1

# Pre-migration backup
# Run manually before migrations: /opt/news-intelligence/scripts/backup-migration.sh
```

---

## Manual Backup Procedures

### Immediate Backup
```bash
cd /opt/news-intelligence

# Create immediate backup
BACKUP_FILE="/opt/backups/news-intelligence/migrations/manual_backup_$(date +%Y%m%d_%H%M%S).sql"
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Verify backup
ls -lh ${BACKUP_FILE}.gz
```

### Pre-Deployment Backup
```bash
cd /opt/news-intelligence

# Create pre-deployment backup
BACKUP_FILE="/opt/backups/news-intelligence/migrations/pre_deploy_$(date +%Y%m%d_%H%M%S).sql"
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Note current git commit
git rev-parse HEAD > ${BACKUP_FILE}.git_commit

# Verify backup
ls -lh ${BACKUP_FILE}.gz
cat ${BACKUP_FILE}.git_commit
```

### Pre-Migration Backup
```bash
cd /opt/news-intelligence

# Create pre-migration backup
BACKUP_FILE="/opt/backups/news-intelligence/migrations/pre_migration_$(date +%Y%m%d_%H%M%S).sql"
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Note current migration state
npx prisma migrate status > ${BACKUP_FILE}.migration_status

# Verify backup
ls -lh ${BACKUP_FILE}.gz
cat ${BACKUP_FILE}.migration_status
```

---

## Restore Procedures

### Restore from Backup
```bash
cd /opt/news-intelligence

# List available backups
ls -lh /opt/backups/news-intelligence/daily/

# Select backup to restore
BACKUP_FILE="/opt/backups/news-intelligence/daily/news_intelligence_20240117_120000.sql.gz"

# Stop application
docker compose stop api

# Restore database
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# Verify restore
docker exec news_intelligence_postgres psql -U news_intelligence -c "\dt"

# Restart application
docker compose start api

# Verify application
curl http://localhost:3000/health
```

### Restore to Point in Time
```bash
cd /opt/news-intelligence

# Find backup closest to desired time
ls -lh /opt/backups/news-intelligence/daily/ | grep "20240117"

# Restore backup
BACKUP_FILE="/opt/backups/news-intelligence/daily/news_intelligence_20240117_120000.sql.gz"
docker compose stop api
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# Apply WAL logs if available (for PostgreSQL with WAL archiving)
# This requires additional PostgreSQL configuration

# Restart application
docker compose start api
```

### Restore from S3 (if configured)
```bash
cd /opt/news-intelligence

# Download backup from S3
aws s3 cp s3://news-intelligence-backups/daily/news_intelligence_20240117_120000.sql.gz /tmp/

# Restore from downloaded backup
docker compose stop api
gunzip -c /tmp/news_intelligence_20240117_120000.sql.gz | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# Restart application
docker compose start api

# Clean up
rm /tmp/news_intelligence_20240117_120000.sql.gz
```

---

## Backup Verification

### Verify Backup Integrity
```bash
cd /opt/news-intelligence

# Test gzip integrity
for backup in /opt/backups/news-intelligence/daily/*.sql.gz; do
    echo "Testing: $backup"
    gzip -t "$backup" && echo "✅ OK" || echo "❌ CORRUPTED"
done
```

### Verify Backup Content
```bash
cd /opt/news-intelligence

# Extract and examine backup
BACKUP_FILE="/opt/backups/news-intelligence/daily/news_intelligence_20240117_120000.sql.gz"
gunzip -c "$BACKUP_FILE" | head -20

# Check for table definitions
gunzip -c "$BACKUP_FILE" | grep -E "CREATE TABLE"

# Check for data
gunzip -c "$BACKUP_FILE" | grep -E "INSERT INTO"
```

### Test Restore Procedure
```bash
cd /opt/news-intelligence

# Create test database
docker exec news_intelligence_postgres psql -U news_intelligence -c "CREATE DATABASE test_restore;"

# Restore to test database
BACKUP_FILE="/opt/backups/news-intelligence/daily/news_intelligence_20240117_120000.sql.gz"
gunzip -c "$BACKUP_FILE" | docker exec -i news_intelligence_postgres psql -U news_intelligence test_restore

# Verify test database
docker exec news_intelligence_postgres psql -U news_intelligence test_restore -c "\dt"

# Clean up test database
docker exec news_intelligence_postgres psql -U news_intelligence -c "DROP DATABASE test_restore;"
```

---

## Backup Monitoring

### Monitor Backup Success
```bash
# Check backup log
tail -50 /var/log/news-intelligence-backup.log

# Check for recent backups
ls -lh /opt/backups/news-intelligence/daily/ | tail -10

# Verify backup cron job is running
systemctl status cron
```

### Backup Size Monitoring
```bash
# Monitor backup directory size
du -sh /opt/backups/news-intelligence/

# Monitor individual backup sizes
ls -lh /opt/backups/news-intelligence/daily/

# Alert if backups are too large
BACKUP_SIZE=$(du -s /opt/backups/news-intelligence/ | cut -f1)
if [ $BACKUP_SIZE -gt 10485760 ]; then  # 10GB
    echo "WARNING: Backup directory size exceeds 10GB"
fi
```

### Backup Age Monitoring
```bash
# Check age of most recent backup
LATEST_BACKUP=$(ls -t /opt/backups/news-intelligence/daily/*.sql.gz | head -1)
BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 86400 ))

if [ $BACKUP_AGE -gt 2 ]; then
    echo "WARNING: Most recent backup is $BACKUP_AGE days old"
fi
```

---

## Backup Maintenance

### Clean Old Backups
```bash
cd /opt/news-intelligence

# Clean daily backups older than 7 days
find /opt/backups/news-intelligence/daily -name "*.sql.gz" -mtime +7 -delete

# Clean weekly backups older than 4 weeks
find /opt/backups/news-intelligence/weekly -name "*.sql.gz" -mtime +28 -delete

# Clean monthly backups older than 12 months
find /opt/backups/news-intelligence/monthly -name "*.sql.gz" -mtime +365 -delete

# Clean migration backups older than 6 months
find /opt/backups/news-intelligence/migrations -name "*.sql.gz" -mtime +180 -delete
```

### Verify Backup Directory
```bash
cd /opt/news-intelligence

# Check backup directory structure
tree /opt/backups/news-intelligence/

# Verify permissions
ls -la /opt/backups/news-intelligence/

# Verify ownership
stat /opt/backups/news-intelligence/
```

### Backup Storage Optimization
```bash
# Compress old backups
find /opt/backups/news-intelligence/daily -name "*.sql" -mtime +1 -exec gzip {} \;

# Verify compression saved space
du -sh /opt/backups/news-intelligence/

# Monitor disk space
df -h /opt/
```

---

## Disaster Recovery

### Complete System Recovery
```bash
cd /opt/news-intelligence

# 1. Stop all services
docker compose down

# 2. Find most recent good backup
LATEST_BACKUP=$(ls -t /opt/backups/news-intelligence/daily/*.sql.gz | head -1)

# 3. Restore database
gunzip -c "$LATEST_BACKUP" | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# 4. Start services
docker compose up -d

# 5. Verify system
docker compose ps
curl http://localhost:3000/health

# 6. Check logs
docker compose logs api --tail=50
```

### Partial Recovery (Specific Tables)
```bash
cd /opt/news-intelligence

# Extract specific table from backup
BACKUP_FILE="/opt/backups/news-intelligence/daily/news_intelligence_20240117_120000.sql.gz"
gunzip -c "$BACKUP_FILE" | grep -A 1000 "CREATE TABLE public.articles" > /tmp/articles_restore.sql

# Restore specific table
docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence < /tmp/articles_restore.sql

# Clean up
rm /tmp/articles_restore.sql
```

---

## Backup Testing Schedule

### Monthly Backup Testing
```bash
# Schedule monthly backup test (first Sunday of month)
# Add to crontab:
0 5 * * 0 [ $(date +\%d) -le 7 ] && /opt/news-intelligence/scripts/test-restore.sh >> /var/log/news-intelligence-restore-test.log 2>&1
```

### Create Test Restore Script
```bash
cat > /opt/news-intelligence/scripts/test-restore.sh << 'EOF'
#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> /var/log/news-intelligence-restore-test.log
}

log "Starting backup test..."

# Get most recent backup
LATEST_BACKUP=$(ls -t /opt/backups/news-intelligence/daily/*.sql.gz | head -1)
log "Testing backup: $LATEST_BACKUP"

# Create test database
docker exec news_intelligence_postgres psql -U news_intelligence -c "DROP DATABASE IF EXISTS test_restore;"
docker exec news_intelligence_postgres psql -U news_intelligence -c "CREATE DATABASE test_restore;"

# Restore to test database
gunzip -c "$LATEST_BACKUP" | docker exec -i news_intelligence_postgres psql -U news_intelligence test_restore

if [ $? -eq 0 ]; then
    log "✅ Backup test successful"
    
    # Verify data
    TABLE_COUNT=$(docker exec news_intelligence_postgres psql -U news_intelligence test_restore -c "\dt" | wc -l)
    log "Restored $TABLE_COUNT tables"
    
    # Clean up
    docker exec news_intelligence_postgres psql -U news_intelligence -c "DROP DATABASE test_restore;"
else
    log "❌ Backup test failed"
    exit 1
fi

log "Backup test completed"
EOF

chmod +x /opt/news-intelligence/scripts/test-restore.sh
```

---

## Backup Best Practices

### Do's
- ✅ Test backups regularly
- ✅ Use compression to save space
- ✅ Implement retention policies
- ✅ Store backups offsite
- ✅ Document backup procedures
- ✅ Monitor backup success
- ✅ Encrypt sensitive backups
- ✅ Use version control for backup scripts
- ✅ Automate backup verification
- ✅ Keep multiple backup generations

### Don'ts
- ❌ Store unencrypted backups
- ❌ Keep only one backup
- ❌ Ignore backup failures
- ❌ Test backups only when needed
- ❌ Store backups on same disk as database
- ❌ Forget to clean old backups
- ❌ Skip backup documentation
- ❌ Ignore backup size growth
- ❌ Use backup files directly without testing
- ❌ Forget to monitor disk space

---

## Backup Summary

### Current Backup Configuration
- **Daily Backups**: 2 AM, keep 7 days
- **Weekly Backups**: Sunday 3 AM, keep 4 weeks
- **Monthly Backups**: 1st 4 AM, keep 12 months
- **Migration Backups**: Manual, keep indefinitely
- **Backup Location**: `/opt/backups/news-intelligence/`
- **Compression**: gzip enabled
- **Integrity Checks**: Automated
- **Offsite Storage**: Optional (S3)

### Backup Verification
- [ ] Automated backup script created
- [ ] Cron jobs configured
- [ ] Backup directory structure created
- [ ] Permissions set correctly
- [ ] Log files configured
- [ ] Test restore script created
- [ ] Monitoring procedures documented
- [ ] Cleanup procedures configured
- [ ] Disaster recovery procedures documented
- [ ] Team trained on backup procedures

**PostgreSQL backup strategy fully implemented and documented.**