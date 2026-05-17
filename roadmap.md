# roadmap.md

## Development Roadmap

### Overview

This roadmap outlines a pragmatic development path from MVP to large-scale deployment, focusing on delivering value incrementally while maintaining technical excellence.

---

## Phase 1: MVP (Weeks 1-2)

### Goals

Build a functional, production-ready news intelligence platform that:
- Monitors 3-5 Uzbek news sources via RSS
- Extracts, processes, and summarizes articles using AI
- Provides manual approval workflow via simple admin interface
- Publishes curated content to Telegram channel automatically
- Demonstrates core value proposition

### Deliverables

**Technical Deliverables:**
- NestJS application with modular architecture
- PostgreSQL database with core schema
- Redis-based queue system (BullMQ)
- RSS fetching and parsing system
- Basic AI integration (OpenAI GPT-4o-mini)
- Simple Telegram bot for publishing
- HTML admin dashboard (no React initially)
- Docker Compose deployment
- Basic error handling and logging

**Functional Deliverables:**
- 3-5 news sources operational (Kun.uz, Daryo.uz, Qalampir.uz)
- Automatic article extraction and storage
- AI-powered summarization and classification
- Manual approval workflow
- Automatic Telegram publishing
- Basic source health monitoring
- Simple analytics dashboard

### Complexity

**Overall Complexity:** Medium
**Risk Level:** Low
**Dependencies:** External APIs (OpenAI, Telegram)

### Week-by-Week Breakdown

#### Week 1: Core Infrastructure

**Days 1-2: Project Setup**
```bash
# Initialize NestJS project
npx @nestjs/cli new news-intelligence --package-manager npm
cd news-intelligence

# Install core dependencies
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/bull bull ioredis
npm install rss-parser
npm install openai
npm install node-telegram-bot-api
npm install class-validator class-transformer
npm install -D @types/node-telegram-bot-api @types/rss-parser

# Initialize Prisma
npx prisma init

# Create basic schema
# Set up Docker Compose
# Configure environment variables
```

**Days 3-4: Database & Core Entities**
```typescript
// Prisma schema
model Source {
  id          Int      @id @default(autoincrement())
  name        String   @db.VarChar(255)
  url         String   @unique @db.VarChar(2048)
  rss_url     String   @db.VarChar(2048)
  is_active   Boolean  @default(true)
  last_fetched_at DateTime?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
}

model Article {
  id                Int      @id @default(autoincrement())
  source_id         Int
  original_title    String   @db.VarChar(1000)
  original_url      String   @unique @db.VarChar(2048)
  original_content  String?  @db.Text
  published_at      DateTime?
  summary           String?  @db.Text
  category          String?  @db.VarChar(100)
  status            ArticleStatus @default(PENDING)
  telegram_message_id Int?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  source            Source    @relation(fields: [source_id], references: [id])
}

enum ArticleStatus {
  PENDING
  APPROVED
  REJECTED
  PUBLISHED
}
```

**Days 5-7: RSS & Queue System**
```typescript
// RSS Fetcher Service
@Injectable()
export class RssFetcherService {
  async fetchSource(source: Source): Promise<RSSItem[]> {
    const parser = new Parser();
    const feed = await parser.parseURL(source.rss_url);
    
    return feed.items.map(item => ({
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      content: item['content:encoded'] || item.description || ''
    }));
  }
}

// Queue Processor
@Processor('fetch-rss')
export class FetchRssProcessor {
  async process(job: Job): Promise<void> {
    const sources = await this.sourcesService.getActiveSources();
    
    for (const source of sources) {
      try {
        const items = await this.rssFetcher.fetchSource(source);
        
        for (const item of items) {
          await this.articlesService.createIfNotExists(item, source.id);
        }
      } catch (error) {
        logger.error({ sourceId: source.id, error }, 'RSS fetch failed');
      }
    }
  }
}
```

#### Week 2: AI & Publishing

**Days 8-9: AI Integration**
```typescript
// AI Service
@Injectable()
export class AiService {
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  async summarize(content: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Create a 2-sentence summary in Russian or Uzbek.'
        },
        {
          role: 'user',
          content: `Summarize: ${content.substring(0, 1000)}`
        }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    return response.choices[0].message.content || '';
  }

  async classify(title: string): Promise<string> {
    const categories = ['politics', 'economy', 'sports', 'technology', 'world'];
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify into one of: ${categories.join(', ')}`
        },
        {
          role: 'user',
          content: title
        }
      ],
      max_tokens: 20,
      temperature: 0.3
    });

    const result = response.choices[0].message.content?.toLowerCase() || 'general';
    return categories.includes(result) ? result : 'general';
  }
}
```

**Days 10-11: Telegram Integration**
```typescript
// Telegram Service
@Injectable()
export class TelegramService {
  private readonly bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  private readonly channelId = process.env.TELEGRAM_CHANNEL_ID;

  async publishArticle(article: Article): Promise<number> {
    const message = this.formatMessage(article);
    
    const result = await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });

    return result.message_id;
  }

  private formatMessage(article: Article): string {
    return `*${article.original_title}*

${article.summary || ''}

[Читать далее](${article.original_url})
`;
  }
}
```

**Days 12-13: Admin Dashboard**
```html
<!-- Simple HTML admin interface -->
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>News Intelligence Admin</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .article-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
        .actions { margin-top: 10px; }
        button { margin-right: 5px; padding: 5px 10px; }
        .approve { background: #4CAF50; color: white; }
        .reject { background: #f44336; color: white; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
        .stat-card { background: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; }
    </style>
</head>
<body>
    <h1>📰 News Intelligence Admin</h1>
    
    <div class="stats">
        <div class="stat-card">
            <h3 id="total-articles">0</h3>
            <p>Total Articles</p>
        </div>
        <div class="stat-card">
            <h3 id="pending-articles">0</h3>
            <p>Pending</p>
        </div>
        <div class="stat-card">
            <h3 id="published-articles">0</h3>
            <p>Published</p>
        </div>
        <div class="stat-card">
            <h3 id="active-sources">0</h3>
            <p>Active Sources</p>
        </div>
    </div>
    
    <div id="articles-list"></div>
    
    <script src="/admin.js"></script>
</body>
</html>
```

```javascript
// admin.js
const API_URL = '/api';

async function loadArticles() {
    const response = await fetch(`${API_URL}/articles?status=pending`);
    const articles = await response.json();
    
    const container = document.getElementById('articles-list');
    container.innerHTML = articles.map(article => `
        <div class="article-card">
            <h3>${article.original_title}</h3>
            <p><strong>Summary:</strong> ${article.summary || 'Processing...'}</p>
            <p><strong>Category:</strong> ${article.category || 'N/A'}</p>
            <p><strong>Source:</strong> ${article.source?.name || 'N/A'}</p>
            <a href="${article.original_url}" target="_blank">Read original</a>
            <div class="actions">
                <button class="approve" onclick="approveArticle(${article.id})">✅ Approve</button>
                <button class="reject" onclick="rejectArticle(${article.id})">❌ Reject</button>
            </div>
        </div>
    `).join('');
}

async function approveArticle(id) {
    await fetch(`${API_URL}/articles/${id}/approve`, { method: 'POST' });
    loadArticles();
    loadStats();
}

async function rejectArticle(id) {
    await fetch(`${API_URL}/articles/${id}/reject`, { method: 'POST' });
    loadArticles();
    loadStats();
}

async function loadStats() {
    const stats = await fetch(`${API_URL}/stats`).then(r => r.json());
    document.getElementById('total-articles').textContent = stats.totalArticles;
    document.getElementById('pending-articles').textContent = stats.pendingArticles;
    document.getElementById('published-articles').textContent = stats.publishedArticles;
    document.getElementById('active-sources').textContent = stats.activeSources;
}

loadArticles();
loadStats();
setInterval(loadStats, 30000); // Update stats every 30 seconds
```

**Day 14: Deployment & Testing**
```bash
# Final testing checklist
- [ ] Test RSS fetching from all sources
- [ ] Test AI summarization and classification
- [ ] Test manual approval workflow
- [ ] Test Telegram publishing
- [ ] Test error handling
- [ ] Deploy to production VPS
- [ ] Verify all services running
- [ ] Monitor for 24 hours
```

### Priorities

**Must Have (P0):**
1. RSS fetching and parsing
2. Article extraction and storage
3. AI summarization
4. Manual approval workflow
5. Telegram publishing
6. Basic error handling

**Should Have (P1):**
1. Category classification
2. Source health monitoring
3. Simple analytics dashboard
4. Basic logging

**Nice to Have (P2):**
1. Image handling
2. Duplicate detection (basic)
3. Engagement tracking
4. Source management UI

### What NOT to Build Yet

**Skip entirely for MVP:**
- ❌ Complex duplicate detection (use simple URL check only)
- ❌ Vector database or semantic search
- ❌ Real-time updates (scheduled is sufficient)
- ❌ User authentication (single admin user)
- ❌ Advanced analytics
- ❌ Multiple Telegram channels
- ❌ Scheduled publishing (publish immediately after approval)
- ❌ Content versioning/audit trail
- ❌ API rate limiting (basic limits sufficient)
- ❌ Webhook support (polling is fine)
- ❌ Image optimization/compression
- ❌ Advanced moderation tools
- ❌ Email notifications
- ❌ SEO optimization (not needed for Telegram-first)
- ❌ Mobile app
- ❌ Public API
- ❌ Payment processing
- ❌ Multi-language support (Russian/Uzbek only)

**Defer to Phase 2:**
- ⏸️ Full duplicate detection pipeline
- ⏸️ Source management UI (use database operations)
- ⏸️ Advanced error handling and recovery
- ⏸️ Comprehensive monitoring
- ⏸️ Automated testing suite
- ⏸️ CI/CD pipeline

### Success Criteria

**Technical Success:**
- ✅ All 3-5 sources fetching successfully every 15 minutes
- ✅ AI processing completes with 95%+ success rate
- ✅ Telegram publishing works reliably
- ✅ System runs 24+ hours without manual intervention
- ✅ Error rate < 5%

**Business Success:**
- ✅ 10+ articles published per day
- ✅ Admin can approve/reject articles efficiently
- ✅ Content quality is acceptable for production use
- ✅ System costs < $50/month
- ✅ Can scale to 10 sources with minimal changes

### Estimated Timeline

**Week 1:** Infrastructure + Database + RSS (5 days)
**Week 2:** AI + Telegram + Admin + Testing (5 days)
**Buffer:** 2 days for debugging and fixes
**Total:** 10-12 working days

---

## Phase 2: Growth (Weeks 3-8)

### Goals

Scale the platform to handle 20-50 sources with enhanced features and improved reliability.

### Deliverables

**Technical Enhancements:**
- Upgraded infrastructure (bigger VPS)
- PostgreSQL read replica
- Enhanced duplicate detection
- Advanced AI features (title rewriting, sentiment analysis)
- Multiple Telegram channels support
- Scheduled publishing
- Better error handling and recovery
- Basic monitoring and alerting
- Automated testing framework

**Functional Enhancements:**
- 20-50 news sources operational
- Advanced duplicate detection with AI semantic check
- Scheduled publishing with optimal timing
- Multi-channel Telegram support
- Trending topic detection
- Source performance analytics
- Enhanced moderation tools
- Bulk operations
- API documentation

### Complexity

**Overall Complexity:** High
**Risk Level:** Medium
**Dependencies:** All Phase 1 dependencies + additional monitoring tools

### Week-by-Week Breakdown

#### Week 3-4: Infrastructure Scaling

**Infrastructure Upgrade:**
```bash
# Upgrade VPS resources
# From: 2 CPU, 4GB RAM
# To: 4 CPU, 8GB RAM

# Separate database instance
# Add PostgreSQL read replica
# Upgrade Redis configuration for persistence
```

**Database Optimization:**
```sql
-- Add performance indexes
CREATE INDEX CONCURRENTLY idx_articles_summary_fts ON articles USING GIN(to_tsvector('russian', summary));
CREATE INDEX CONCURRENTLY idx_articles_tags ON articles USING GIN(tags);

-- Partition articles by date (prepare for scale)
-- Create archive table for old data
```

**Connection Pool Configuration:**
```typescript
// Enhanced connection pool
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=20&pool_timeout=20`
    }
  },
  log: ['query', 'error', 'warn']
});
```

#### Week 5-6: Advanced Features

**Enhanced Duplicate Detection:**
```typescript
@Injectable()
export class AdvancedDuplicateDetectionService {
  async detectDuplicates(article: Article): Promise<DuplicateResult> {
    // Phase 1: URL exact match
    const urlMatch = await this.checkURLMatch(article.original_url);
    if (urlMatch) return { isDuplicate: true, method: 'url_exact' };
    
    // Phase 2: Title similarity
    const titleMatch = await this.checkTitleSimilarity(article);
    if (titleMatch.score > 0.9) {
      return { isDuplicate: true, method: 'title_similarity', score: titleMatch.score };
    }
    
    // Phase 3: Content similarity (for edge cases)
    if (titleMatch.score > 0.7) {
      const contentMatch = await this.checkContentSimilarity(article);
      if (contentMatch.score > 0.8) {
        // Phase 4: AI semantic check
        const aiCheck = await this.aiSemanticCheck(article, contentMatch.articleId);
        if (aiCheck.isDuplicate) {
          return { isDuplicate: true, method: 'ai_semantic', score: aiCheck.confidence };
        }
      }
    }
    
    return { isDuplicate: false, method: 'none' };
  }
}
```

**Title Rewriting:**
```typescript
async function rewriteTitle(title: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Rewrite the title to be more informative and less sensational. Keep it under 100 characters.'
      },
      {
        role: 'user',
        content: title
      }
    ],
    max_tokens: 50,
    temperature: 0.5
  });

  return response.choices[0].message.content || title;
}
```

**Multi-Channel Support:**
```typescript
interface TelegramChannel {
  id: string;
  name: string;
  categories: string[];
  template: string;
  schedule: string[];
}

const CHANNELS: TelegramChannel[] = [
  {
    id: '@news_general',
    name: 'General News',
    categories: ['politics', 'economy', 'world'],
    template: 'default',
    schedule: ['08:00', '13:00', '19:00']
  },
  {
    id: '@news_sports',
    name: 'Sports News',
    categories: ['sports'],
    template: 'sports',
    schedule: ['12:00', '18:00', '22:00']
  }
];

async function routeToChannels(article: Article): Promise<void> {
  const targetChannels = CHANNELS.filter(channel =>
    channel.categories.includes(article.category)
  );

  for (const channel of targetChannels) {
    await publishQueue.add('publish-telegram', {
      articleId: article.id,
      channelId: channel.id,
      template: channel.template
    });
  }
}
```

#### Week 7-8: Analytics & Monitoring

**Basic Monitoring:**
```typescript
@Injectable()
export class MonitoringService {
  async getHealthStatus(): Promise<HealthStatus> {
    return {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      queues: await this.checkQueues(),
      ai: await this.checkAI(),
      telegram: await this.checkTelegram()
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latency: this.measureLatency(prisma) };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  private async checkQueues(): Promise<QueueHealth[]> {
    const queues = ['fetch-rss', 'extract-content', 'ai-process', 'publish-telegram'];
    
    return await Promise.all(queues.map(async name => {
      const queue = this.bullMQ.getQueue(name);
      const waiting = await queue.getWaitingCount();
      const active = await queue.getActiveCount();
      
      return {
        name,
        waiting,
        active,
        healthScore: this.calculateQueueHealth(waiting, active)
      };
    }));
  }
}
```

**Analytics Dashboard:**
```typescript
@Injectable()
export class AnalyticsService {
  async getDailyStats(date: Date): Promise<DailyStats> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [total, published, rejected, failed] = await Promise.all([
      prisma.article.count({ where: { created_at: { gte: startOfDay, lte: endOfDay } } }),
      prisma.article.count({ where: { created_at: { gte: startOfDay, lte: endOfDay }, status: 'published' } }),
      prisma.article.count({ where: { created_at: { gte: startOfDay, lte: endOfDay }, status: 'rejected' } }),
      prisma.article.count({ where: { created_at: { gte: startOfDay, lte: endOfDay }, status: 'failed' } })
    ]);

    return {
      date: startOfDay,
      total,
      published,
      rejected,
      failed,
      successRate: total > 0 ? (published / total) * 100 : 0
    };
  }

  async getSourcePerformance(sourceId: number, days: number = 30): Promise<SourcePerformance> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [articles, errors] = await Promise.all([
      prisma.article.count({
        where: {
          source_id,
          created_at: { gte: startDate }
        }
      }),
      prisma.crawlError.count({
        where: {
          article: { source_id },
          created_at: { gte: startDate }
        }
      })
    ]);

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    const successRate = source?.health_score || 0;

    return {
      sourceId,
      sourceName: source?.name || 'Unknown',
      articles,
      errors,
      successRate,
      reliability: successRate > 90 ? 'high' : successRate > 70 ? 'medium' : 'low'
    };
  }
}
```

### Priorities

**Must Have (P0):**
1. Infrastructure scaling
2. Enhanced duplicate detection
3. Multi-channel support
4. Basic monitoring and health checks
5. Scheduled publishing
6. Source performance tracking

**Should Have (P1):**
1. Title rewriting
2. Sentiment analysis
3. Trending topic detection
4. Advanced moderation tools
5. Bulk operations
6. Enhanced error handling

**Nice to Have (P2):**
1. Full-text search
2. Advanced analytics dashboards
3. Custom message templates
4. Engagement tracking
5. API rate limiting per user

### What NOT to Build Yet

**Skip for Phase 2:**
- ❌ Kubernetes deployment (Docker Compose still sufficient)
- ❌ Vector database (not needed at this scale)
- ❌ Advanced AI features (trending prediction, viral detection)
- ❌ Real-time collaboration features
- ❌ Advanced user management
- ❌ API monetization
- ❌ Mobile app
- ❌ WebSocket support (polling still sufficient)

**Defer to Phase 3:**
- ⏸️ Advanced AI-powered features
- ⏸️ Full monitoring stack (Prometheus/Grafana)
- ⏸️ Advanced security features
- ⏸️ Multi-tenant support
- ⏸️ Advanced analytics and BI tools

### Success Criteria

**Technical Success:**
- ✅ 20-50 sources operational
- ✅ 99.5%+ uptime
- ✅ AI processing time < 30 seconds
- ✅ Duplicate detection accuracy > 95%
- ✅ Multi-channel publishing working reliably
- ✅ System can handle 5000+ articles/day

**Business Success:**
- ✅ 50+ articles published per day
- ✅ Content quality improved from MVP
- ✅ User engagement metrics tracked
- ✅ System costs < $150/month
- ✅ Can scale to 100 sources with minor changes

### Estimated Timeline

**Week 3-4:** Infrastructure scaling (2 weeks)
**Week 5-6:** Advanced features (2 weeks)
**Week 7-8:** Analytics and monitoring (2 weeks)
**Buffer:** 1 week for testing and fixes
**Total:** 7-9 weeks

---

## Phase 3: Scale (Weeks 9-24)

### Goals

Transform the platform into a scalable, enterprise-grade system capable of handling 100-200 sources with advanced intelligence features.

### Deliverables

**Technical Enhancements:**
- Kubernetes deployment
- PostgreSQL cluster with read replicas
- Redis cluster
- Advanced monitoring (Prometheus/Grafana)
- CI/CD pipeline
- Advanced AI features (trending detection, viral prediction)
- Vector database for semantic search
- Advanced security features
- Performance optimization at scale

**Functional Enhancements:**
- 100-200 news sources operational
- AI-powered trending detection
- Viral content prediction
- Advanced topic clustering
- Entity tracking and monitoring
- Custom AI-curated feeds
- Advanced moderation with AI assistance
- Public API access
- Multi-language support expansion
- Advanced analytics and insights

### Complexity

**Overall Complexity:** Very High
**Risk Level:** High
**Dependencies:** All previous dependencies + Kubernetes, monitoring stack, vector database

### Month-by-Month Breakdown

#### Month 1 (Weeks 9-12): Infrastructure & Deployment

**Kubernetes Setup:**
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: news-intelligence-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: news-intelligence-api
  template:
    metadata:
      labels:
        app: news-intelligence-api
    spec:
      containers:
      - name: api
        image: news-intelligence/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: news-intelligence-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: news-intelligence-secrets
              key: redis-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: news-intelligence-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: news-intelligence-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**CI/CD Pipeline:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Run linting
        run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: docker build -t news-intelligence/api:${{ github.sha }} .
      - name: Push to registry
        run: docker push news-intelligence/api:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Kubernetes
        run: kubectl set image deployment/news-intelligence-api api=news-intelligence/api:${{ github.sha }}
      - name: Verify deployment
        run: kubectl rollout status deployment/news-intelligence-api
```

#### Month 2 (Weeks 13-16): Advanced AI Features

**Trending Detection:**
```typescript
@Injectable()
export class TrendingDetectionService {
  async detectTrendingTopics(hours: number = 24): Promise<TrendingTopic[]> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    const recentArticles = await prisma.article.findMany({
      where: {
        created_at: { gte: cutoffTime },
        status: 'published'
      },
      include: { category: true }
    });

    // Extract keywords
    const keywordCounts = new Map<string, number>();
    const sourceCounts = new Map<string, Set<string>>();

    for (const article of recentArticles) {
      const keywords = this.extractKeywords(article.original_title);
      
      for (const keyword of keywords) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
        
        const sources = sourceCounts.get(keyword) || new Set();
        sources.add(article.source_id);
        sourceCounts.set(keyword, sources);
      }
    }

    // Calculate trending score
    const trendingTopics = Array.from(keywordCounts.entries())
      .filter(([keyword, count]) => count >= 3) // Minimum threshold
      .map(([keyword, count]) => {
        const sources = sourceCounts.get(keyword) || new Set();
        const velocity = this.calculateVelocity(keyword, count, hours);
        
        return {
          topic: keyword,
          mentionCount: count,
          sourceCount: sources.size,
          velocity,
          firstSeen: this.getFirstSeen(keyword),
          peakTime: this.getPeakTime(keyword)
        };
      })
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 20);

    return trendingTopics;
  }

  private calculateVelocity(keyword: string, count: number, hours: number): number {
    // Compare with previous time period
    const previousPeriod = hours * 2;
    const previousCount = this.getHistoricalCount(keyword, previousPeriod);
    
    if (previousCount === 0) return count; // First appearance
    return (count - previousCount) / previousCount;
  }
}
```

**Viral Prediction:**
```typescript
@Injectable()
export class ViralPredictionService {
  async predictVirality(article: Article): Promise<ViralityScore> {
    const features = await this.extractFeatures(article);
    const model = await this.loadModel('virality-prediction');
    
    const prediction = await model.predict(features);
    const score = prediction[0]; // 0-1 score

    return {
      score,
      confidence: prediction[1],
      prediction: score > 0.7 ? 'viral' : score > 0.5 ? 'engaging' : 'normal',
      factors: this.getTopFeatures(features, prediction[2]) // Feature importance
    };
  }

  private async extractFeatures(article: Article): Promise<number[]> {
    const source = await prisma.source.findUnique({
      where: { id: article.source_id }
    });

    return [
      // Content features
      article.title.length / 100,
      (article.summary?.length || 0) / 100,
      article.word_count / 500,
      (article.summary?.split('.').length || 0) / 10,
      
      // Source features
      source.health_score / 100,
      source.error_count / 10,
      
      // Timing features
      this.getHourOfDay(article.published_at) / 24,
      this.getDayOfWeek(article.published_at) / 7,
      
      // Topic features
      this.isBreakingNews(article.title) ? 1 : 0,
      this.hasNumbers(article.title) ? 1 : 0,
      this.hasQuestionMark(article.title) ? 1 : 0,
      
      // Category features (one-hot encoded)
      this.getCategoryFeatures(article.category)
    ];
  }
}
```

**Topic Clustering:**
```typescript
@Injectable()
export class TopicClusteringService {
  async clusterArticles(hours: number = 24): Promise<ArticleCluster[]> {
    const recentArticles = await prisma.article.findMany({
      where: {
        created_at: { gte: new Date(Date.now() - hours * 3600000) },
        status: 'published'
      }
    });

    // Generate embeddings
    const embeddings = await this.generateEmbeddings(recentArticles);
    
    // Perform clustering (DBSCAN algorithm)
    const clusters = this.dbscan(embeddings, {
      epsilon: 0.3,
      minPoints: 3
    });

    // Process clusters
    return clusters.map(cluster => ({
      id: generateId(),
      topic: this.extractTopicName(cluster.articles),
      articles: cluster.articles,
      sources: this.getUniqueSources(cluster.articles),
      timeline: this.buildTimeline(cluster.articles),
      summary: await this.generateClusterSummary(cluster.articles),
      importance: this.calculateClusterImportance(cluster),
      firstSeen: cluster.articles[0].created_at,
      lastSeen: cluster.articles[cluster.articles.length - 1].created_at
    }));
  }

  private async generateEmbeddings(articles: Article[]): Promise<number[][]> {
    const texts = articles.map(a => a.title + ' ' + (a.summary || ''));
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts
    });

    return response.data.map(item => item.embedding);
  }

  private dbscan(embeddings: number[][], options: DBScanOptions): Cluster[] {
    const { epsilon, minPoints } = options;
    const visited = new Set<number>();
    const clusters: Cluster[] = [];
    
    for (let i = 0; i < embeddings.length; i++) {
      if (visited.has(i)) continue;
      
      const neighbors = this.getNeighbors(embeddings, i, epsilon);
      
      if (neighbors.length < minPoints) {
        visited.add(i);
        continue;
      }
      
      const cluster: Cluster = {
        id: clusters.length,
        articles: [articles[i]],
        points: [embeddings[i]]
      };
      
      this.expandCluster(embeddings, neighbors, cluster, visited, epsilon, minPoints);
      clusters.push(cluster);
    }
    
    return clusters;
  }
}
```

#### Month 3 (Weeks 17-20): Advanced Monitoring & Security

**Prometheus Monitoring:**
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'news-intelligence-api'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: news-intelligence-api
      - source_labels: [__meta_kubernetes_pod_ip]
        target_label: __address__
        replacement: $1:3000

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

**Grafana Dashboards:**
```json
{
  "dashboard": {
    "title": "News Intelligence Platform",
    "panels": [
      {
        "title": "Articles per Minute",
        "targets": [
          {
            "expr": "rate(articles_created_total[1m])",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "AI Processing Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, ai_processing_duration_seconds)",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Queue Sizes",
        "targets": [
          {
            "expr": "bullmq_queue_size{queue=\"ai-process\"}",
            "legendFormat": "AI Process"
          },
          {
            "expr": "bullmq_queue_size{queue=\"publish-telegram\"}",
            "legendFormat": "Telegram Publish"
          }
        ]
      },
      {
        "title": "Telegram Publishing Success Rate",
        "targets": [
          {
            "expr": "rate(telegram_messages_published_total[5m]) / rate(telegram_messages_total[5m]) * 100",
            "legendFormat": "Success Rate"
          }
        ]
      }
    ]
  }
}
```

**Advanced Security:**
```typescript
// Security service
@Injectable()
export class SecurityService {
  async validateApiKey(apiKey: string): Promise<User | null> {
    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey, is_active: true },
      include: { user: true }
    });

    if (!key) return null;

    // Check expiration
    if (key.expires_at && key.expires_at < new Date()) {
      await this.revokeApiKey(key.id);
      return null;
    }

    // Check rate limit
    const usage = await this.checkRateLimit(key.id);
    if (!usage) {
      return null;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { last_used_at: new Date(), usage_count: key.usage_count + 1 }
    });

    return key.user;
  }

  private async checkRateLimit(apiKeyId: number): Promise<boolean> {
    const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    
    if (!key) return false;

    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60000);

    const recentUsage = await prisma.auditLog.count({
      where: {
        created_at: { gte: minuteAgo },
        action: 'api_request'
      }
    });

    return recentUsage < key.rate_limit;
  }

  async sanitizeInput(input: string, maxLength: number = 1000): Promise<string> {
    // Remove HTML tags
    let sanitized = input.replace(/<[^>]*>/g, '');
    
    // Truncate
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }
    
    // Remove extra whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }

  async detectSensitiveContent(content: string): Promise<SensitiveContentResult> {
    const sensitiveKeywords = await this.getSensitiveKeywords();
    
    for (const keyword of sensitiveKeywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        return {
          detected: true,
          keyword,
          severity: this.getSeverity(keyword)
        };
      }
    }

    return { detected: false };
  }
}
```

#### Month 4 (Weeks 21-24): Advanced Features & Optimization

**Vector Database Integration:**
```typescript
// Pinecone vector database service
@Injectable()
export class VectorDatabaseService {
  private pinecone: Pinecone;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
  }

  async upsertArticleVector(article: Article): Promise<void> {
    const embedding = await this.generateEmbedding(article);
    
    await this.pinecone.index('news-intelligence').upsert([{
      id: article.id.toString(),
      values: embedding,
      metadata: {
        title: article.original_title,
        category: article.category,
        publishedAt: article.published_at?.toISOString(),
        sourceId: article.source_id
      }
    }]);
  }

  async semanticSearch(query: string, filters: SearchFilters, limit: number = 10): Promise<Article[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = await this.pinecone.index('news-intelligence').query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
      filter: this.buildPineconeFilter(filters)
    });

    const articleIds = results.matches.map(match => match.id);
    
    return await prisma.article.findMany({
      where: { id: { in: articleIds.map(id => parseInt(id)) } },
      include: { source: true, category: true }
    });
  }

  private buildPineconeFilter(filters: SearchFilters): any {
    const pineconeFilters: any = {};
    
    if (filters.category) {
      pineconeFilters.category = { $eq: filters.category };
    }
    
    if (filters.sourceId) {
      pineconeFilters.sourceId = { $eq: filters.sourceId };
    }
    
    if (filters.dateFrom) {
      pineconeFilters.publishedAt = { $gte: filters.dateFrom.toISOString() };
    }
    
    return pineconeFilters;
  }
}
```

**Advanced AI Features:**
```typescript
// Breaking news detection
@Injectable()
export class BreakingNewsDetectionService {
  async detectBreakingNews(article: Article): Promise<BreakingNewsResult> {
    const signals = await Promise.all([
      this.checkSourceVelocity(article),
      this.checkKeywordIntensity(article),
      this.checkTimingAnomaly(article),
      this.checkCrossSourceCoverage(article)
    ]);

    const score = this.calculateBreakingScore(signals);
    
    return {
      isBreaking: score > 0.7,
      score,
      signals,
      confidence: this.calculateConfidence(signals)
    };
  }

  private async checkSourceVelocity(article: Article): Promise<number> {
    const lastHour = new Date(Date.now() - 3600000);
    
    const sourceArticles = await prisma.article.count({
      where: {
        source_id: article.source_id,
        created_at: { gte: lastHour }
      }
    });

    const averageArticles = await this.getSourceAverageArticles(article.source_id);
    
    return Math.min(1, (sourceArticles / (averageArticles || 1)) * 2);
  }

  private checkKeywordIntensity(article: Article): number {
    const urgentKeywords = [
      'срочно', 'экстренно', 'внимание', 'террорист',
      'взрыв', 'стрельба', 'землетрясение', 'авария',
      'скончался', 'погиб', 'катастрофа', 'чрезвычайная ситуация'
    ];

    const content = article.original_title.toLowerCase();
    const matches = urgentKeywords.filter(keyword => content.includes(keyword));
    
    return Math.min(1, matches.length / 3);
  }

  private async checkCrossSourceCoverage(article: Article): Promise<number> {
    const keywords = this.extractKeywords(article.original_title);
    
    const sources = await prisma.source.count({
      where: {
        articles: {
          some: {
            original_title: { contains: keywords.slice(0, 2).join(' ') },
            created_at: { gte: new Date(Date.now() - 3600000) }
          }
        }
      }
    });

    return Math.min(1, sources / 3); // If 3+ sources have similar news
  }
}
```

### Priorities

**Must Have (P0):**
1. Kubernetes deployment
2. Advanced monitoring (Prometheus/Grafana)
3. CI/CD pipeline
4. Vector database for semantic search
5. Trending detection
6. Advanced security features
7. Performance optimization at scale

**Should Have (P1):**
1. Viral prediction
2. Topic clustering
3. Breaking news detection
4. Advanced AI curation
5. Public API access
6. Multi-language support
7. Advanced analytics

**Nice to Have (P2):**
1. Advanced user management
2. API monetization
3. Mobile app
4. Real-time collaboration
5. Advanced moderation with AI
6. Custom AI model fine-tuning

### What NOT to Build Yet

**Skip for Phase 3:**
- ❌ Advanced multi-tenant architecture (single tenant still sufficient)
- ❌ Geographic distribution (single region still sufficient)
- ❌ Advanced caching strategies (Redis still sufficient)
- ❌ Custom hardware optimization
- ❌ Blockchain or Web3 features
- ❌ AI model fine-tuning on our own data
- ❌ Voice or video features
- ❌ Augmented reality features

**Defer to Phase 4 (Large Scale):**
- ⏸️ Full distributed architecture
- ⏸️ Global CDN integration
- ⏸️ Advanced sharding strategies
- ⏸️ Custom ML infrastructure
- ⏸️ Advanced business intelligence tools

### Success Criteria

**Technical Success:**
- ✅ 100-200 sources operational
- ✅ 99.9%+ uptime
- ✅ AI processing time < 10 seconds
- ✅ Semantic search working reliably
- ✅ System can handle 50000+ articles/day
- ✅ Kubernetes deployment stable
- ✅ Monitoring and alerting comprehensive

**Business Success:**
- ✅ 500+ articles published per day
- ✅ Advanced AI features providing clear value
- ✅ Public API access operational
- ✅ Multiple revenue streams identified
- ✅ System costs < $500/month at current scale
- ✅ Clear path to 1000+ sources

### Estimated Timeline

**Month 1:** Infrastructure & deployment (4 weeks)
**Month 2:** Advanced AI features (4 weeks)
**Month 3:** Monitoring & security (4 weeks)
**Month 4:** Advanced features & optimization (4 weeks)
**Buffer:** 2-4 weeks for testing and fixes
**Total:** 16-20 weeks (4-5 months)

---

## Scaling Roadmap

### Current → 100 Sources

**Architecture Changes:**
- Single VPS → 2-3 VPS cluster
- Simple Docker Compose → Docker Swarm
- Basic monitoring → Comprehensive monitoring
- Manual scaling → Auto-scaling
- Single database → Primary + replica

**Performance Targets:**
- Articles/day: 5,000 → 20,000
- Sources: 10 → 100
- AI processing time: < 30s → < 15s
- Uptime: 99% → 99.5%
- Response time: < 200ms → < 100ms

**Infrastructure Costs:**
- $60-100/month → $300-500/month
- Team: 1 developer → 2-3 developers

**Timeline:** 2-3 months from MVP completion

### 100 → 1,000 Sources

**Architecture Changes:**
- VPS cluster → Kubernetes cluster
- Docker Swarm → K8s with Helm charts
- Basic monitoring → Prometheus + Grafana + AlertManager
- Simple auto-scaling → Horizontal Pod Autoscaler
- Database → PostgreSQL cluster with sharding
- Redis → Redis Cluster
- CDN integration for static assets

**Performance Targets:**
- Articles/day: 20,000 → 100,000
- Sources: 100 → 1,000
- AI processing time: < 15s → < 5s
- Uptime: 99.5% → 99.9%
- Response time: < 100ms → < 50ms

**Infrastructure Costs:**
- $300-500/month → $2,000-5,000/month
- Team: 2-3 developers → 5-10 engineers (DevOps, SRE, ML engineer)

**Timeline:** 6-9 months from 100 sources completion

### 1,000 → 10,000+ Sources

**Architecture Changes:**
- Kubernetes cluster → Multi-region Kubernetes
- PostgreSQL cluster → Distributed PostgreSQL with sharding
- Redis Cluster → Multi-region Redis
- Monolithic → Microservices architecture
- Simple caching → Multi-layer caching strategy
- Basic CDN → Global CDN with edge computing
- Centralized processing → Edge computing for AI inference

**Performance Targets:**
- Articles/day: 100,000 → 1,000,000+
- Sources: 1,000 → 10,000+
- AI processing time: < 5s → < 2s
- Uptime: 99.9% → 99.99%
- Response time: < 50ms → < 20ms

**Infrastructure Costs:**
- $2,000-5,000/month → $20,000-50,000/month
- Team: 5-10 engineers → 20-50 engineers (full engineering team)

**Timeline:** 12-18 months from 1,000 sources completion

### Technology Evolution

**MVP (Phase 1):**
- NestJS monolith
- PostgreSQL single instance
- Redis single instance
- Docker Compose
- Basic logging
- Manual deployments

**Growth (Phase 2):**
- NestJS monolith with modules
- PostgreSQL + read replica
- Redis with persistence
- Docker Compose with health checks
- Structured logging
- Automated backups
- Basic monitoring

**Scale (Phase 3):**
- NestJS monolith (well-optimized)
- PostgreSQL cluster
- Redis Cluster
- Kubernetes deployment
- Prometheus + Grafana monitoring
- CI/CD pipeline
- Vector database
- Advanced security

**Large Scale (Phase 4+):**
- Microservices architecture
- Distributed PostgreSQL
- Redis Cluster with global distribution
- Kubernetes multi-region
- Advanced monitoring stack
- Edge computing
- Custom ML infrastructure
- Global CDN

### Cost Evolution

**Infrastructure Costs:**
- MVP: $30-50/month
- Growth: $100-300/month
- Scale: $500-2,000/month
- Large Scale: $5,000-20,000/month

**AI Costs:**
- MVP (100 articles/day): $5-10/month
- Growth (1,000 articles/day): $30-50/month
- Scale (10,000 articles/day): $200-400/month
- Large Scale (100,000 articles/day): $1,500-3,000/month

**Total Cost Evolution:**
- MVP: $40-60/month
- Growth: $150-400/month
- Scale: $800-2,500/month
- Large Scale: $7,000-25,000/month

### Team Evolution

**MVP (1-2 people):**
- 1 Full-stack developer
- 1 Part-time DevOps (optional)

**Growth (2-4 people):**
- 2 Full-stack developers
- 1 DevOps/SRE
- 1 Part-time ML engineer

**Scale (5-10 people):**
- 3 Full-stack developers
- 1 DevOps/SRE
- 1 ML engineer
- 1 Part-time product manager
- 1 Part-time UI/UX designer

**Large Scale (15-50 people):**
- 5-10 Backend engineers
- 3-5 Frontend engineers
- 2-3 DevOps/SRE engineers
- 2-3 ML engineers
- 1-2 Data engineers
- 1-2 Security engineers
- 1 Product manager
- 1 Engineering manager
- 1 UI/UX designer
- 1 QA engineer

### Risk Mitigation

**Technical Risks:**
- **Source blocking**: Implement graceful degradation, maintain source diversity
- **AI API limits**: Implement caching, batching, and fallback strategies
- **Database bottlenecks**: Plan for read replicas, connection pooling, caching
- **Scraping reliability**: Build fallback mechanisms, source health monitoring
- **Telegram rate limits**: Implement strict rate limiting, scheduling
- **Data consistency**: Design for eventual consistency where possible

**Business Risks:**
- **Legal issues**: Implement proper attribution, respect robots.txt, allow opt-out
- **Market changes**: Maintain flexibility in architecture, avoid over-specialization
- **Competition**: Focus on unique value proposition, build defensible moats
- **Monetization challenges**: Plan multiple revenue streams from day one
- **Team scaling**: Document architecture, maintain code quality, hire for culture fit

**Operational Risks:**
- **Deployment failures**: Implement blue-green deployments, rollback procedures
- **Monitoring gaps**: Start with basic monitoring, enhance incrementally
- **Security breaches**: Implement security best practices from day one, regular audits
- **Data loss**: Implement automated backups, disaster recovery procedures
- **Performance degradation**: Plan for capacity, monitor key metrics, proactive scaling

### Success Metrics

**Phase 1 (MVP) Success:**
- Technical: 10 sources, 100 articles/day, 95% uptime
- Business: Validated product-market fit, positive user feedback
- Financial: <$100/month operational costs, clear path to revenue

**Phase 2 (Growth) Success:**
- Technical: 50 sources, 5,000 articles/day, 99% uptime
- Business: Growing user base, engagement metrics improving
- Financial: <$500/month operational costs, revenue covering 50%+ of costs

**Phase 3 (Scale) Success:**
- Technical: 200 sources, 50,000 articles/day, 99.5% uptime
- Business: Strong user retention, clear differentiation from competitors
- Financial: <$5,000/month operational costs, revenue covering operational costs

**Phase 4 (Large Scale) Success:**
- Technical: 1,000+ sources, 500,000+ articles/day, 99.9% uptime
- Business: Market leader, defensible position, strong growth
- Financial: Sustainable unit economics, clear path to profitability

---

## Summary

This roadmap provides a clear, incremental path from MVP to large-scale platform:

**Phase 1 (2 weeks):** Build functional MVP with 3-5 sources, prove concept
**Phase 2 (6 weeks):** Scale to 20-50 sources, add advanced features
**Phase 3 (16 weeks):** Scale to 100-200 sources, enterprise-grade architecture
**Scale (12-18 months):** Scale to 1,000+ sources, distributed architecture

**Key Principles:**
- **Incremental Delivery**: Ship value every 2 weeks
- **Technical Excellence**: Maintain high code quality and architecture
- **Business Focus**: Every feature must have clear business value
- **Scalability First**: Design for scale from day one
- **Risk Mitigation**: Identify and mitigate risks proactively

**Realistic Expectations:**
- MVP: 2-3 months (including iterations)
- Growth: 3-4 additional months
- Scale: 4-6 additional months
- Large Scale: 12-18 additional months

This roadmap balances ambition with pragmatism, ensuring each phase delivers tangible value while building toward long-term scalability and success.