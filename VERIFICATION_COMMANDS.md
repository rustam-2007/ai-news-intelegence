# Verification Commands

## Docker Build Verification

### 1. Verify Dockerfile Syntax
```bash
# Check Dockerfile syntax
docker build --no-cache --progress=plain -t test-build . 2>&1 | tee build.log
```

### 2. Build Production Image
```bash
# Build production image
docker build -t news-intelligence:latest .

# Verify build completed successfully
docker images | grep news-intelligence

# Check image size
docker images news-intelligence:latest --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

### 3. Test Container Startup
```bash
# Run container with environment variables
docker run -d \
  --name test-api \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://test:test@localhost:5432/test" \
  -e REDIS_URL="redis://localhost:6379" \
  -e NODE_ENV="test" \
  news-intelligence:latest

# Wait for container to start
sleep 10

# Check container status
docker ps | grep test-api

# Check container logs
docker logs test-api

# Test health endpoint
curl http://localhost:3000/health

# Clean up
docker stop test-api
docker rm test-api
```

### 4. Verify Multi-Stage Build
```bash
# Build with build history
docker build --progress=plain -t news-intelligence:latest . | grep -E "(Stage|FROM|COPY|RUN)"

# Verify image layers
docker history news-intelligence:latest

# Check image size (should be < 500MB for production)
docker images news-intelligence:latest --format "Size: {{.Size}}"
```

### 5. Verify Security Features
```bash
# Verify non-root user
docker run --rm news-intelligence:latest whoami
# Expected output: nestjs

# Verify file permissions
docker run --rm news-intelligence:latest ls -la /app

# Verify dumb-init is installed
docker run --rm news-intelligence:latest which dumb-init
# Expected output: /usr/bin/dumb-init

# Check for exposed ports
docker run --rm news-intelligence:latest docker ps
```

## Prisma Migration Verification

### 1. Verify Prisma Schema
```bash
# Validate Prisma schema
npx prisma validate

# Format Prisma schema
npx prisma format

# Check schema syntax
npx prisma validate --schema=./prisma/schema.prisma
```

### 2. Generate Prisma Client
```bash
# Generate Prisma Client
npx prisma generate

# Verify client was generated
ls -la node_modules/.prisma/client/

# Check Prisma Client version
npx prisma --version

# Test Prisma Client import
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); console.log('Prisma Client loaded successfully');"
```

### 3. Test Database Connection (Requires Docker)
```bash
# Start PostgreSQL container
docker compose up -d postgres

# Wait for database to be ready
sleep 15

# Test database connection
docker exec news_intelligence_postgres pg_isready -U news_intelligence

# Verify database exists
docker exec news_intelligence_postgres psql -U news_intelligence -c "\l"

# Test Prisma connection
npx prisma db pull
# This should succeed if connection is working
```

### 4. Create and Run Migrations (Requires Docker)
```bash
# Start PostgreSQL
docker compose up -d postgres

# Wait for database to be healthy
until docker exec news_intelligence_postgres pg_isready -U news_intelligence; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Create migration
npx prisma migrate dev --name init

# Verify migration was created
ls -la prisma/migrations/

# Check migration SQL
cat prisma/migrations/*/migration.sql

# Verify schema in database
docker exec news_intelligence_postgres psql -U news_intelligence -c "\dt"

# Verify tables were created
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"

# For production deployment:
npx prisma migrate deploy
```

### 5. Seed Database (Optional)
```bash
# Create seed script
npx prisma db seed

# Verify data was seeded
docker exec news_intelligence_postgres psql -U news_intelligence -c "SELECT * FROM sources LIMIT 5;"
```

### 6. Test Prisma Operations
```bash
# Create test script
cat > test-prisma.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Test query
    const count = await prisma.source.count();
    console.log('✅ Sources count:', count);

    // Test transaction
    await prisma.$transaction(async (tx) => {
      console.log('✅ Transaction test passed');
    });

    // Disconnect
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

test();
EOF

# Run test script
node test-prisma.js

# Clean up
rm test-prisma.js
```

## Health Endpoint Verification

### 1. Start Application (Requires Docker)
```bash
# Start all services
docker compose up -d

# Wait for application to be healthy
sleep 20

# Check container status
docker compose ps

# Check application logs
docker compose logs api
```

### 2. Test Health Endpoint
```bash
# Basic health check
curl http://localhost:3000/health

# Verbose output
curl -v http://localhost:3000/health

# Pretty-print JSON response
curl http://localhost:3000/health | jq .

# Test with timeout
curl --max-time 5 http://localhost:3000/health
```

### 3. Verify Health Response
```bash
# Expected response structure
curl -s http://localhost:3000/health | jq '.status'
# Expected: "ok"

curl -s http://localhost:3000/health | jq '.timestamp'
# Expected: ISO 8601 timestamp

curl -s http://localhost:3000/health | jq '.uptime'
# Expected: number (seconds)

curl -s http://localhost:3000/health | jq '.database'
# Expected: "connected"

curl -s http://localhost:3000/health | jq '.redis'
# Expected: "connected"

curl -s http://localhost:3000/health | jq '.environment'
# Expected: "development" or "production"
```

### 4. Test Health Endpoint Resilience
```bash
# Test endpoint availability
for i in {1..10}; do
  curl -s http://localhost:3000/health | jq '.status'
  sleep 1
done

# Test concurrent requests
for i in {1..20}; do
  curl -s http://localhost:3000/health > /dev/null &
done
wait

# Test endpoint after restart
docker compose restart api
sleep 15
curl http://localhost:3000/health
```

### 5. Monitor Health Check
```bash
# Continuous health monitoring
while true; do
  STATUS=$(curl -s http://localhost:3000/health | jq -r '.status')
  if [ "$STATUS" = "ok" ]; then
    echo "$(date): ✅ Healthy"
  else
    echo "$(date): ❌ Unhealthy: $STATUS"
  fi
  sleep 10
done

# Press Ctrl+C to stop
```

## Comprehensive Verification Script

### Run All Verifications
```bash
#!/bin/bash

echo "=== Starting Verification ==="

# 1. Docker Build Verification
echo "1. Verifying Docker build..."
docker build -t news-intelligence:latest . > build.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Docker build successful"
else
  echo "❌ Docker build failed"
  cat build.log
  exit 1
fi

# 2. Prisma Schema Validation
echo "2. Validating Prisma schema..."
npx prisma validate > prisma.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Prisma schema valid"
else
  echo "❌ Prisma schema invalid"
  cat prisma.log
  exit 1
fi

# 3. Generate Prisma Client
echo "3. Generating Prisma Client..."
npx prisma generate > generate.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Prisma Client generated"
else
  echo "❌ Prisma Client generation failed"
  cat generate.log
  exit 1
fi

# 4. TypeScript Build
echo "4. Building TypeScript..."
npm run build > build_ts.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ TypeScript build successful"
else
  echo "❌ TypeScript build failed"
  cat build_ts.log
  exit 1
fi

# 5. ESLint Check
echo "5. Running ESLint..."
npm run lint > lint.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ ESLint check passed"
else
  echo "❌ ESLint check failed"
  cat lint.log
  exit 1
fi

echo "=== All Verifications Passed ✅ ==="

# Clean up logs
rm -f build.log prisma.log generate.log build_ts.log lint.log

echo "Ready for deployment!"
```

## Troubleshooting Verification Failures

### Docker Build Issues
```bash
# Check build logs
cat build.log

# Common issues:
# - Syntax error in Dockerfile
# - Missing files
# - Network issues downloading packages
# - Insufficient disk space

# Check disk space
df -h

# Clean Docker cache
docker system prune -a
```

### Prisma Issues
```bash
# Check Prisma logs
cat prisma.log

# Regenerate Prisma Client
rm -rf node_modules/.prisma
npx prisma generate

# Verify schema format
npx prisma format
npx prisma validate
```

### TypeScript Build Issues
```bash
# Check build logs
cat build_ts.log

# Common issues:
# - Type errors
# - Missing dependencies
# - Configuration issues

# Reinstall dependencies
rm -rf node_modules
npm install

# Clean build artifacts
rm -rf dist
npm run build
```

### Health Endpoint Issues
```bash
# Check container logs
docker compose logs api

# Check container status
docker compose ps

# Restart container
docker compose restart api

# Check port availability
sudo lsof -i :3000
```

## Final Deployment Checklist

- [ ] Docker build completes successfully
- [ ] Prisma schema is valid
- [ ] Prisma Client generates without errors
- [ ] TypeScript build succeeds
- [ ] ESLint check passes
- [ ] Database migrations run successfully
- [ ] Health endpoint returns correct response
- [ ] All containers are running and healthy
- [ ] Logs show no errors
- [ ] Application is accessible from expected ports

**All verification commands documented. Ready for VPS deployment!**