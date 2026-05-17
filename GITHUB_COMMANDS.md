# GitHub Push Commands

## Initial Repository Setup

### 1. Initialize Git Repository
```bash
# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "feat: implement Phase 1 foundation for AI News Intelligence Platform

- Initialize NestJS application with TypeScript
- Create MVP database schema with 7 models (Source, Article, Category, TelegramPost, CrawlLog, ModerationQueue, User)
- Add health check endpoint with monitoring
- Implement production-ready Docker configuration
- Set up PostgreSQL and Redis with Docker Compose
- Configure validation, CORS, and error handling
- Add comprehensive deployment documentation
- Fix package.json dependencies (@prisma/client in production)
- Implement security best practices (non-root user, health checks, restart policies)

Tech Stack: NestJS, Prisma, PostgreSQL, Redis, Docker

Status: Foundation complete, ready for VPS deployment"
```

### 2. Create GitHub Repository
```bash
# Go to https://github.com/new
# Create repository: news-intelligence-platform
# DO NOT initialize with README, .gitignore, or license

# Add remote origin
git remote add origin https://github.com/YOUR_USERNAME/news-intelligence-platform.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Alternative: Push Existing Repository
```bash
# If repository already exists on GitHub
git remote add origin https://github.com/YOUR_USERNAME/news-intelligence-platform.git
git branch -M main
git push -u origin main
```

## Subsequent Commits

### Push New Changes
```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add RSS feed parsing module"

# Push to main branch
git push origin main
```

### Create Feature Branch
```bash
# Create and switch to feature branch
git checkout -b feature/rss-parsing

# Make changes and commit
git add .
git commit -m "feat: implement RSS feed parser"

# Push feature branch
git push -u origin feature/rss-parsing

# Create Pull Request on GitHub
```

### Merge Feature Branch
```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge feature branch
git merge feature/rss-parsing

# Push merged changes
git push origin main

# Delete feature branch (optional)
git branch -d feature/rss-parsing
git push origin --delete feature/rss-parsing
```

## Troubleshooting

### Force Push (Use with Caution)
```bash
# Only use if you know what you're doing
git push --force origin main
```

### Undo Last Commit
```bash
# Keep changes staged
git reset --soft HEAD~1

# Remove changes completely
git reset --hard HEAD~1
```

### Change Remote URL
```bash
# Change remote URL
git remote set-url origin https://github.com/NEW_USERNAME/new-repository.git
```

## Repository Settings Checklist

After creating repository on GitHub:

- [ ] Set repository visibility (public/private)
- [ ] Enable branch protection for main branch
- [ ] Configure branch rules (require PR reviews)
- [ ] Set up branch naming conventions
- [ ] Enable GitHub Actions (for CI/CD in future phases)
- [ ] Add repository topics/tags
- [ ] Set repository description
- [ ] Add repository license (MIT)
- [ ] Configure security settings
- [ ] Enable dependency alerts