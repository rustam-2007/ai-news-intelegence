# AI News Intelligence Platform

A production-ready news intelligence platform that monitors multiple news sources, processes articles using AI, and publishes curated content to Telegram channels.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm or yarn

### Local Development Setup

1. **Clone the repository and navigate to the project directory**

2. **Copy environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Start PostgreSQL and Redis using Docker Compose**
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Set up Prisma and run migrations**
   ```bash
   # Generate Prisma Client
   npx prisma generate
   
   # Run database migrations
   npx prisma migrate dev --name init
   ```

6. **Start the application**
   ```bash
   npm run start:dev
   ```

7. **Verify health check**
   ```bash
   curl http://localhost:3000/health
   ```

### Using Docker Compose (Full Stack)

To run the entire stack (PostgreSQL, Redis, and API) with Docker Compose:

```bash
# Start all services
docker-compose up

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## 📁 Project Structure

```
.
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── health/                # Health check module
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── health.module.ts
│   ├── app.controller.ts      # Main application controller
│   ├── app.service.ts         # Main application service
│   ├── app.module.ts          # Main application module
│   └── main.ts                # Application entry point
├── docker-compose.yml         # Docker Compose configuration
├── Dockerfile                 # Docker image configuration
├── .env.example              # Environment variables template
└── package.json              # Dependencies and scripts
```

## 🛠️ Available Scripts

- `npm run start` - Start application in production mode
- `npm run start:dev` - Start application in development mode with hot reload
- `npm run start:debug` - Start application in debug mode
- `npm run build` - Build the application
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run lint` - Run ESLint
- `npx prisma studio` - Open Prisma Studio (database GUI)
- `npx prisma migrate dev` - Create and apply migration
- `npx prisma migrate deploy` - Apply migrations in production
- `npx prisma generate` - Generate Prisma Client

## 🏗️ Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **Validation**: class-validator & class-transformer
- **Deployment**: Docker Compose

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/db_name"

# Redis
REDIS_URL="redis://localhost:6379"

# Application
NODE_ENV="development"
PORT=3000
```

### Database Schema

The MVP includes the following models:
- `Source` - News source configuration
- `Article` - News articles
- `Category` - Article categories
- `TelegramPost` - Telegram message tracking
- `CrawlLog` - Crawl operation logs
- `ModerationQueue` - Content moderation queue
- `User` - User accounts

## 🏥 Health Check

The application provides a health check endpoint:

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-17T10:30:00.000Z",
  "uptime": 123.456,
  "database": "connected",
  "redis": "connected",
  "version": "1.0.0",
  "environment": "development"
}
```

## 📝 Development Workflow

1. **Make changes to Prisma schema** (if needed)
   ```bash
   # Update schema in prisma/schema.prisma
   # Create migration
   npx prisma migrate dev --name describe_your_changes
   ```

2. **Run the application**
   ```bash
   npm run start:dev
   ```

3. **Test changes**
   ```bash
   # Run unit tests
   npm run test
   
   # Run e2e tests
   npm run test:e2e
   ```

## 🐛 Troubleshooting

### Database Connection Issues

If you encounter database connection errors:

1. Check if PostgreSQL is running:
   ```bash
   docker-compose ps postgres
   ```

2. Check PostgreSQL logs:
   ```bash
   docker-compose logs postgres
   ```

3. Verify DATABASE_URL in `.env` file

### Redis Connection Issues

If you encounter Redis connection errors:

1. Check if Redis is running:
   ```bash
   docker-compose ps redis
   ```

2. Check Redis logs:
   ```bash
   docker-compose logs redis
   ```

3. Verify REDIS_URL in `.env` file

### Port Already in Use

If port 3000 is already in use:

1. Modify the PORT in `.env` file
2. Or stop the process using port 3000:
   ```bash
   # On Linux/Mac
   lsof -ti:3000 | xargs kill -9
   
   # On Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

## 📚 Next Steps

Phase 1 foundation is complete. The following features will be implemented in upcoming phases:

- RSS feed fetching and parsing
- Content extraction with scraping fallback
- AI-powered summarization and classification
- Duplicate detection
- Telegram bot integration
- Admin dashboard
- Queue-based processing with BullMQ

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions, please open an issue in the repository.
