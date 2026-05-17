# Rollback Commands

## Quick Rollback Scenarios

### Scenario 1: Application Won't Start
```bash
# 1. Check what went wrong
cd /opt/news-intelligence
docker compose logs api --tail=50

# 2. Stop current application
docker compose stop api

# 3. Check previous version
git log --oneline -5

# 4. Checkout previous working version
git checkout <previous_commit_hash>

# 5. Rebuild and restart
npm install
docker compose up -d --build api

# 6. Verify
docker compose ps
curl http://localhost:3000/health
```

### Scenario 2: Database Migration Failed
```bash
# 1. Check migration status
cd /opt/news-intelligence
npx prisma migrate status

# 2. Identify failed migration
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Rollback to previous migration
npx prisma migrate resolve --applied <previous_migration_name>

# 4. Verify schema
docker exec news_intelligence_postgres psql -U news_intelligence -c "\dt"

# 5. Test application
curl http://localhost:3000/health
```

### Scenario 3: Complete System Rollback
```bash
# 1. Stop all services
cd /opt/news-intelligence
docker compose down

# 2. Restore database from backup
BACKUP_FILE="/opt/backups/news-intelligence/news_intelligence_20240117_120000.sql.gz"
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# 3. Checkout previous working version
git checkout <previous_commit_hash>

# 4. Reinstall dependencies
npm install

# 5. Regenerate Prisma Client
npx prisma generate

# 6. Rebuild and start
docker compose up -d --build

# 7. Verify all services
docker compose ps
curl http://localhost:3000/health
```

---

## Git-Based Rollback Procedures

### Rollback to Previous Commit
```bash
cd /opt/news-intelligence

# View commit history
git log --oneline -10

# Rollback to specific commit (keeps changes)
git checkout <commit_hash>

# OR hard rollback (discards changes)
git reset --hard <commit_hash>

# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild application
docker compose up -d --build api

# Verify
docker compose ps
curl http://localhost:3000/health
```

### Rollback to Specific Branch
```bash
cd /opt/news-intelligence

# List available branches
git branch -a

# Checkout previous branch
git checkout <branch_name>

# Pull latest changes
git pull origin <branch_name>

# Reinstall and rebuild
npm install
docker compose up -d --build api

# Verify
docker compose ps
curl http://localhost:3000/health
```

### Create Rollback Branch
```bash
cd /opt/news-intelligence

# Create rollback point
git tag rollback-$(date +%Y%m%d_%H%M%S)

# Push tag to remote
git push origin rollback-$(date +%Y%m%d_%H%M%S)

# Continue with changes...
```

### Revert Specific Commit
```bash
cd /opt/news-intelligence

# Revert commit (creates new commit)
git revert <commit_hash>

# Resolve conflicts if any
# git add .
# git commit -m "Revert: <commit_message>"

# Deploy reverted version
npm install
docker compose up -d --build api

# Verify
docker compose ps
curl http://localhost:3000/health
```

---

## Docker-Based Rollback Procedures

### Rollback to Previous Docker Image
```bash
cd /opt/news-intelligence

# List available images
docker images | grep news-intelligence

# Tag current working image as backup
docker tag news-intelligence:latest news-intelligence:backup-$(date +%Y%m%d_%H%M%S)

# Pull previous image (if available)
# docker pull news-intelligence:v1.0.0

# OR rebuild from previous commit
git checkout <previous_commit>
docker build -t news-intelligence:latest .

# Restart with previous image
docker compose up -d --force-recreate api

# Verify
docker compose ps
curl http://localhost:3000/health
```

### Rollback Docker Compose Configuration
```bash
cd /opt/news-intelligence

# Backup current configuration
cp docker-compose.yml docker-compose.yml.backup

# Checkout previous version
git checkout <previous_commit> -- docker-compose.yml

# Restart with new configuration
docker compose down
docker compose up -d

# Verify
docker compose ps
curl http://localhost:3000/health
```

### Clean Docker State
```bash
# Remove all containers
docker compose down

# Remove volumes (WARNING: DESTRUCTIVE)
# docker compose down -v

# Remove images
docker rmi news-intelligence:latest

# Clean Docker system
docker system prune -a

# Rebuild from scratch
cd /opt/news-intelligence
docker compose up -d --build

# Verify
docker compose ps
curl http://localhost:3000/health
```

---

## Database Rollback Procedures

### Restore from Backup
```bash
cd /opt/news-intelligence

# List available backups
ls -lh /opt/backups/news-intelligence/

# Stop application
docker compose stop api

# Restore database
BACKUP_FILE="/opt/backups/news-intelligence/news_intelligence_20240117_120000.sql.gz"
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# Restart application
docker compose start api

# Verify
curl http://localhost:3000/health
```

### Rollback Specific Migration
```bash
cd /opt/news-intelligence

# View migration history
npx prisma migrate status

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# Reapply previous migration
npx prisma migrate resolve --applied <previous_migration_name>

# Verify schema
docker exec news_intelligence_postgres psql -U news_intelligence -c "\dt"
```

### Reset Database (DESTRUCTIVE)
```bash
cd /opt/news-intelligence

# WARNING: This deletes all data
# Use only in development or emergencies

# Stop application
docker compose stop api

# Drop and recreate database
docker exec news_intelligence_postgres psql -U news_intelligence -c "DROP DATABASE IF EXISTS news_intelligence;"
docker exec news_intelligence_postgres psql -U news_intelligence -c "CREATE DATABASE news_intelligence;"

# Run migrations
npx prisma migrate deploy

# Seed database (if needed)
# npx prisma db seed

# Restart application
docker compose start api

# Verify
curl http://localhost:3000/health
```

---

## Environment Rollback Procedures

### Restore Previous Environment Configuration
```bash
cd /opt/news-intelligence

# Backup current .env
cp .env .env.backup

# List backup environment files
ls -la .env.*

# Restore previous environment
cp .env.previous .env

# Restart application
docker compose restart api

# Verify
curl http://localhost:3000/health
```

### Revert Environment Changes
```bash
cd /opt/news-intelligence

# Compare environment files
diff .env .env.example

# Manual rollback
vim .env

# Restart affected services
docker compose restart api

# Verify
curl http://localhost:3000/health
```

---

## Emergency Rollback Procedures

### Full System Rollback
```bash
cd /opt/news-intelligence

# 1. Stop everything
docker compose down

# 2. Create emergency backup
BACKUP_DIR="/opt/backups/emergency"
mkdir -p $BACKUP_DIR
cp .env $BACKUP_DIR/
cp docker-compose.yml $BACKUP_DIR/
docker exec news_intelligence_postgres pg_dump -U news_intelligence news_intelligence > $BACKUP_DIR/emergency_backup_$(date +%Y%m%d_%H%M%S).sql

# 3. Restore from last known good state
BACKUP_FILE="/opt/backups/news-intelligence/news_intelligence_LATEST_GOOD.sql.gz"
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# 4. Checkout last known good commit
git checkout <last_good_commit>

# 5. Rebuild everything
rm -rf node_modules dist
npm install
npx prisma generate
docker compose build

# 6. Start services
docker compose up -d

# 7. Verify
docker compose ps
curl http://localhost:3000/health

# 8. Monitor logs
docker compose logs -f api
```

### Partial Rollback (Database Only)
```bash
cd /opt/news-intelligence

# Keep application running
# Only rollback database

# 1. Find appropriate backup
ls -lh /opt/backups/news-intelligence/ | grep "sql.gz"

# 2. Restore database (application continues running)
BACKUP_FILE="/opt/backups/news-intelligence/news_intelligence_20240117_120000.sql.gz"
gunzip -c $BACKUP_FILE | docker exec -i news_intelligence_postgres psql -U news_intelligence news_intelligence

# 3. Restart application to refresh connections
docker compose restart api

# 4. Verify
curl http://localhost:3000/health
```

### Partial Rollback (Application Only)
```bash
cd /opt/news-intelligence

# Keep database as is
# Only rollback application code

# 1. Stop application
docker compose stop api

# 2. Checkout previous version
git checkout <previous_commit>

# 3. Rebuild
npm install
docker compose build api

# 4. Start application
docker compose start api

# 5. Verify
curl http://localhost:3000/health
```

---

## Rollback Verification Procedures

### Post-Rollback Health Check
```bash
cd /opt/news-intelligence

# 1. Check all containers
docker compose ps

# 2. Verify health endpoint
curl http://localhost:3000/health

# 3. Check logs for errors
docker compose logs api --tail=50

# 4. Test database connectivity
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# 5. Test Redis connectivity
docker exec news_intelligence_redis redis-cli ping

# 6. Check system resources
free -h
df -h

# 7. Verify application functionality
curl http://localhost:3000/
```

### Comprehensive Rollback Test
```bash
cd /opt/news-intelligence

# Test all endpoints
echo "Testing health endpoint..."
curl -s http://localhost:3000/health | jq .

echo "Testing API root..."
curl -s http://localhost:3000/api/ | jq .

echo "Database connection test..."
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT 1;"

echo "Redis connection test..."
docker exec news_intelligence_redis redis-cli ping

echo "Checking logs..."
docker compose logs api --tail=10

echo "Checking container status..."
docker compose ps

echo "Rollback verification complete!"
```

### Rollback Documentation
```bash
cd /opt/news-intelligence

# Document rollback
cat >> ROLLBACK_LOG.md << EOF
# Rollback: $(date)

## Reason
[Describe why rollback was performed]

## Actions Taken
- [ ] Application stopped
- [ ] Database restored from: $BACKUP_FILE
- [ ] Git checkout: <commit_hash>
- [ ] Dependencies reinstalled
- [ ] Application rebuilt
- [ ] Services restarted

## Verification
- [ ] Health endpoint: PASS/FAIL
- [ ] Database connectivity: PASS/FAIL
- [ ] Redis connectivity: PASS/FAIL
- [ ] Application functionality: PASS/FAIL

## Rollback Time
Start: $(date)
End: [Complete rollback and add end time]
Duration: [Calculate duration]

## Notes
[Additional notes about the rollback]

## Next Steps
1. [ ] Investigate root cause
2. [ ] Fix underlying issue
3. [ ] Test in staging
4. [ ] Re-deploy with fixes
EOF

# Review rollback log
cat ROLLBACK_LOG.md
```

---

## Rollback Prevention Strategies

### Pre-Deployment Checks
```bash
cd /opt/news-intelligence

# 1. Test build locally
npm run build

# 2. Validate Prisma schema
npx prisma validate

# 3. Dry-run migrations
npx prisma migrate dev --name test --create-only

# 4. Test database connections
npx prisma db pull

# 5. Verify environment variables
source .env
echo $DATABASE_URL
echo $REDIS_URL
```

### Staging Deployment
```bash
# Always deploy to staging first
git checkout staging
git pull origin staging

# Deploy to staging
npm install
docker compose -f docker-compose.staging.yml up -d --build

# Test in staging
curl http://staging.example.com/health

# Only deploy to production after staging tests pass
```

### Incremental Rollouts
```bash
# Deploy to subset of users first
# Monitor for issues
# Gradually increase rollout

# Blue-green deployment strategy
# Maintain two identical environments
# Switch traffic between them
# Rollback by switching back
```

---

## Emergency Contact Procedure

### If Rollback Fails
```bash
# 1. Document the failure
cat > /opt/news-intelligence/EMERGENCY_$(date +%Y%m%d_%H%M%S).log << EOF
Emergency rollback failed
Time: $(date)
Error: [Describe error]
Actions attempted: [List actions]
Current state: [Describe current state]
EOF

# 2. Contact support team
# Send notification with error details

# 3. Maintain service if possible
# Keep old version running while investigating

# 4. Escalate if critical
# Contact system administrator
# Contact DevOps team
```

### Critical System Failure
```bash
# If system is completely down:
# 1. Assess impact
# 2. Communicate with stakeholders
# 3. Attempt rollback
# 4. If rollback fails, escalate
# 5. Document everything
# 6. Plan recovery

# Example escalation script
echo "CRITICAL SYSTEM FAILURE - $(date)" | mail -s "Emergency: News Intelligence Platform Down" admin@yourdomain.com
```

---

## Rollback Best Practices

### Do's
- ✅ Always test rollback procedures
- ✅ Document every rollback
- ✅ Create rollback points before deployment
- ✅ Monitor system after rollback
- ✅ Investigate root cause
- ✅ Update deployment procedures based on lessons learned
- ✅ Communicate with stakeholders
- ✅ Use staging environment for testing

### Don'ts
- ❌ Rollback without investigation
- ❌ Skip verification after rollback
- ❌ Delete old backups immediately
- ❌ Rollback during peak hours unless critical
- ❌ Forget to document rollback
- ❌ Ignore rollback failures
- ❌ Deploy to production without testing

---

**Rollback procedures documented. Emergency escalation plan in place.**