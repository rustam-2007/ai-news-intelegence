# database.md

## Database Design

### Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========================================
// Core Entities
// ========================================

model Source {
  id                Int      @id @default(autoincrement())
  name              String   @db.VarChar(255)
  url               String   @unique @db.VarChar(2048)
  rss_url           String   @db.VarChar(2048)
  type              SourceType @default(RSS)
  
  // Scraping configuration
  enable_scraping   Boolean  @default(false)
  scraping_config   Json?
  rate_limit        Int      @default(10)
  
  // Metadata
  description       String?  @db.Text
  language          String   @default("ru") @db.VarChar(10)
  timezone          String?  @db.VarChar(50)
  
  // Health monitoring
  is_active         Boolean  @default(true)
  last_fetched_at   DateTime?
  last_success_at   DateTime?
  health_score      Int      @default(100)
  error_count       Int      @default(0)
  consecutive_failures Int   @default(0)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  articles          Article[]
  crawl_logs        CrawlLog[]
  
  @@index([is_active])
  @@index([last_fetched_at])
  @@index([health_score])
  @@map("sources")
}

model Article {
  id                Int      @id @default(autoincrement())
  source_id         Int
  
  // Original article data
  original_title    String   @db.VarChar(1000)
  original_url      String   @unique @db.VarChar(2048)
  original_content  String?  @db.Text
  published_at      DateTime?
  author            String?  @db.VarChar(255)
  
  // Extracted metadata
  word_count        Int?
  reading_time      Int?     // in minutes
  image_url         String?  @db.VarChar(2048)
  image_alt         String?  @db.Text
  
  // AI-processed data
  summary           String?  @db.Text
  rewritten_title   String?  @db.VarChar(1000)
  key_points        Json?    // Array of strings
  category_id       Int?
  tags              String[] // Array of tag strings
  language          String?  @db.VarChar(10)
  
  // Quality assessment
  quality_score     Float?   // 0-1
  extraction_quality String? // 'high', 'medium', 'low'
  
  // Status workflow
  status            ArticleStatus @default(PENDING)
  
  // Duplicate detection
  duplicate_of       Int?    // Points to original article
  duplicate_reason   String? @db.VarChar(255)
  similarity_score   Float?
  
  // Moderation
  moderated_by       String? @db.VarChar(255)
  moderated_at       DateTime?
  moderation_notes   String?  @db.Text
  
  // Telegram publishing
  telegram_message_id Int?
  telegram_channel_id String? @db.VarChar(255)
  published_to_telegram_at DateTime?
  
  // AI metadata
  ai_model_summary   String?  @db.VarChar(50)
  ai_model_category String?  @db.VarChar(50)
  ai_cost_cents     Int      @default(0)
  processing_time_ms Int?
  
  // Engagement tracking
  views             Int      @default(0)
  forwards          Int      @default(0)
  reactions         Json?    // { likes: 0, dislikes: 0, fire: 0 }
  engagement_updated_at DateTime?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  source            Source    @relation(fields: [source_id], references: [id], onDelete: Cascade)
  category          Category? @relation(fields: [category_id], references: [id])
  versions          ArticleVersion[]
  telegram_posts    TelegramPost[]
  crawl_errors      CrawlError[]
  moderation_actions ModerationAction[]
  
  @@index([source_id])
  @@index([status])
  @@index([category_id])
  @@index([published_at(sort: Desc)])
  @@index([duplicate_of])
  @@index([created_at(sort: Desc)])
  @@index([telegram_message_id])
  @@index([tags], type: GIN)
  @@map("articles")
}

model ArticleVersion {
  id                Int      @id @default(autoincrement())
  article_id        Int
  
  // Snapshot data
  snapshot          Json     // Full article snapshot
  changes           Json     // What changed
  changed_by        String   @db.VarChar(255) // 'ai', 'admin', 'system'
  change_reason     String?  @db.Text
  
  // Timestamps
  created_at        DateTime @default(now())
  
  // Relations
  article           Article  @relation(fields: [article_id], references: [id], onDelete: Cascade)
  
  @@index([article_id])
  @@index([created_at(sort: Desc)])
  @@map("article_versions")
}

model Category {
  id                Int      @id @default(autoincrement())
  name              String   @unique @db.VarChar(100)
  slug              String   @unique @db.VarChar(100)
  description       String?  @db.Text
  parent_id         Int?
  
  // Display settings
  emoji             String?  @db.VarChar(10)
  color             String?  @db.VarChar(7)
  priority          Int      @default(0)
  is_active         Boolean  @default(true)
  
  // Telegram settings
  telegram_channel_id String? @db.VarChar(255)
  message_template   String?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  parent            Category? @relation("CategoryHierarchy", fields: [parent_id], references: [id])
  children          Category[] @relation("CategoryHierarchy")
  articles          Article[]
  
  @@index([parent_id])
  @@index([is_active])
  @@index([slug])
  @@map("categories")
}

model TelegramPost {
  id                Int      @id @default(autoincrement())
  article_id        Int
  
  // Telegram metadata
  channel_id        String   @db.VarChar(255)
  message_id        Int
  
  // Message content
  content           String   @db.Text
  image_id          String?  @db.VarChar(255)
  reply_markup      Json?
  
  // Publishing
  scheduled_for     DateTime?
  posted_at         DateTime?
  status            TelegramPostStatus @default(PENDING)
  
  // Error handling
  error_message     String?  @db.Text
  retry_count       Int      @default(0)
  max_retries       Int      @default(5)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  article           Article  @relation(fields: [article_id], references: [id], onDelete: Cascade)
  
  @@index([channel_id])
  @@index([message_id])
  @@index([article_id])
  @@index([scheduled_for])
  @@index([status])
  @@map("telegram_posts")
}

model CrawlLog {
  id                Int      @id @default(autoincrement())
  source_id         Int
  
  // Crawl metrics
  articles_found    Int      @default(0)
  articles_processed Int     @default(0)
  articles_new      Int      @default(0)
  articles_duplicates Int    @default(0)
  articles_failed   Int      @default(0)
  
  // Timing
  started_at        DateTime
  completed_at      DateTime?
  duration_ms       Int?
  
  // Error handling
  error_message     String?  @db.Text
  error_type        String?  @db.VarChar(100)
  
  // Additional metadata
  metadata          Json?
  
  // Timestamps
  created_at        DateTime @default(now())
  
  // Relations
  source            Source    @relation(fields: [source_id], references: [id], onDelete: Cascade)
  
  @@index([source_id])
  @@index([started_at(sort: Desc)])
  @@index([created_at(sort: Desc)])
  @@map("crawl_logs")
}

model CrawlError {
  id                Int      @id @default(autoincrement())
  article_id        Int
  
  // Error details
  error_type        String   @db.VarChar(100)
  error_message     String   @db.Text
  error_stack       String?  @db.Text
  
  // Context
  stage              String   @db.VarChar(100) // 'fetch', 'parse', 'extract', 'ai', 'publish'
  retry_count       Int      @default(0)
  max_retries        Int      @default(3)
  
  // Timestamps
  created_at        DateTime @default(now())
  resolved_at       DateTime?
  
  // Relations
  article           Article  @relation(fields: [article_id], references: [id], onDelete: Cascade)
  
  @@index([article_id])
  @@index([error_type])
  @@index([created_at(sort: Desc)])
  @@map("crawl_errors")
}

// ========================================
// Moderation System
// ========================================

model ModerationAction {
  id                Int      @id @default(autoincrement())
  article_id        Int
  
  // Action details
  action            ModerationActionType
  performed_by      String   @db.VarChar(255)
  notes             String?  @db.Text
  
  // Previous state (for rollback)
  previous_status   ArticleStatus?
  previous_data     Json?
  
  // Timestamps
  created_at        DateTime @default(now())
  
  // Relations
  article           Article  @relation(fields: [article_id], references: [id], onDelete: Cascade)
  
  @@index([article_id])
  @@index([performed_by])
  @@index([created_at(sort: Desc)])
  @@map("moderation_actions")
}

model ModerationQueue {
  id                Int      @id @default(autoincrement())
  article_id        Int
  priority          Int      @default(0)
  
  // Queue status
  status            QueueStatus @default(PENDING)
  assigned_to       String?  @db.VarChar(255)
  assigned_at       DateTime?
  
  // Timestamps
  created_at        DateTime @default(now())
  processed_at      DateTime?
  
  // Relations
  article           Article  @relation(fields: [article_id], references: [id], onDelete: Cascade)
  
  @@unique([article_id])
  @@index([status])
  @@index([priority(sort: Desc)])
  @@index([assigned_to])
  @@map("moderation_queue")
}

// ========================================
// User & Authentication
// ========================================

model User {
  id                Int      @id @default(autoincrement())
  email             String   @unique @db.VarChar(255)
  username          String   @unique @db.VarChar(100)
  password_hash     String   @db.VarChar(255)
  
  // Profile
  full_name         String?  @db.VarChar(255)
  avatar_url        String?  @db.VarChar(2048)
  
  // Role and permissions
  role              UserRole  @default(VIEWER)
  permissions       String[] // Array of permission strings
  
  // Account status
  is_active         Boolean  @default(true)
  email_verified    Boolean  @default(false)
  
  // Timestamps
  last_login_at     DateTime?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  api_keys          ApiKey[]
  audit_logs        AuditLog[]
  
  @@index([email])
  @@index([username])
  @@index([is_active])
  @@map("users")
}

model ApiKey {
  id                Int      @id @default(autoincrement())
  user_id           Int
  
  // API key details
  key               String   @unique @db.VarChar(255)
  name              String   @db.VarChar(255)
  description       String?  @db.Text
  
  // Key settings
  is_active         Boolean  @default(true)
  scopes            String[] // ['read', 'write', 'admin']
  rate_limit        Int      @default(100) // requests per minute
  
  // Usage tracking
  last_used_at      DateTime?
  usage_count       Int      @default(0)
  
  // Expiration
  expires_at        DateTime?
  
  // Timestamps
  created_at        DateTime @default(now())
  revoked_at        DateTime?
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([key])
  @@index([user_id])
  @@index([is_active])
  @@map("api_keys")
}

model AuditLog {
  id                Int      @id @default(autoincrement())
  user_id           Int?
  
  // Action details
  action            String   @db.VarChar(100)
  entity_type       String   @db.VarChar(100)
  entity_id         Int?
  
  // Request details
  ip_address        String?  @db.VarChar(45)
  user_agent        String?  @db.Text
  
  // Change data
  changes           Json?
  
  // Result
  status            String   @db.VarChar(50) // 'success', 'failure'
  error_message     String?  @db.Text
  
  // Timestamps
  created_at        DateTime @default(now())
  
  // Relations
  user              User?    @relation(fields: [user_id], references: [id], onDelete: SetNull)
  
  @@index([user_id])
  @@index([entity_type, entity_id])
  @@index([action])
  @@index([created_at(sort: Desc)])
  @@map("audit_logs")
}

// ========================================
// Analytics & Metrics
// ========================================

model DailyStats {
  id                Int      @id @default(autoincrement())
  date              DateTime @unique @db.Date
  
  // Article metrics
  articles_total    Int      @default(0)
  articles_published Int     @default(0)
  articles_rejected Int      @default(0)
  articles_duplicates Int    @default(0)
  
  // Source metrics
  sources_active    Int      @default(0)
  sources_total     Int      @default(0)
  
  // AI metrics
  ai_requests_total Int      @default(0)
  ai_tokens_total   BigInt   @default(0)
  ai_cost_total_cents Int    @default(0)
  
  // Telegram metrics
  telegram_posts_total Int   @default(0)
  telegram_views_total  Int  @default(0)
  
  // Performance metrics
  avg_processing_time_ms Float?
  error_rate        Float?   // 0-1
  
  // Additional metrics
  metadata          Json?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  @@index([date])
  @@map("daily_stats")
}

model SourcePerformance {
  id                Int      @id @default(autoincrement())
  source_id         Int
  date              DateTime @db.Date
  
  // Performance metrics
  articles_found    Int      @default(0)
  articles_processed Int     @default(0)
  articles_new      Int      @default(0)
  avg_processing_time_ms Float?
  success_rate      Float?   // 0-1
  
  // Error metrics
  errors_count      Int      @default(0)
  errors_by_type    Json?    // { 'timeout': 5, 'parse_error': 2 }
  
  // Timing
  first_fetch_at    DateTime?
  last_fetch_at     DateTime?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  @@unique([source_id, date])
  @@index([source_id])
  @@index([date])
  @@map("source_performance")
}

model TrendingTopic {
  id                Int      @id @default(autoincrement())
  topic             String   @db.VarChar(255)
  
  // Trend metrics
  mention_count     Int      @default(0)
  source_count      Int      @default(0)
  velocity          Float?   // Growth rate
  peak_at           DateTime?
  
  // Metadata
  category          String?  @db.VarChar(100)
  related_topics    String[] // Array of related topics
  
  // Status
  is_active         Boolean  @default(true)
  
  // Timestamps
  first_seen_at     DateTime @default(now())
  last_seen_at      DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  @@index([topic])
  @@index([mention_count(sort: Desc)])
  @@index([velocity(sort: Desc)])
  @@index([is_active])
  @@map("trending_topics")
}

// ========================================
// Configuration & Settings
// ========================================

model SystemConfig {
  id                Int      @id @default(autoincrement())
  key               String   @unique @db.VarChar(255)
  value             String   @db.Text
  type              ConfigType
  description       String?  @db.Text
  
  // Access control
  is_public         Boolean  @default(false)
  is_editable       Boolean  @default(true)
  
  // Validation
  validation_regex  String?  @db.VarChar(500)
  default_value     String?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  @@index([key])
  @@index([is_public])
  @@map("system_configs")
}

// ========================================
// Enums
// ========================================

enum SourceType {
  RSS
  SCRAPING
  HYBRID
  API
}

enum ArticleStatus {
  NEW
  EXTRACTING
  PROCESSING
  PENDING
  APPROVED
  REJECTED
  PUBLISHED
  FAILED
  DUPLICATE
}

enum TelegramPostStatus {
  PENDING
  SCHEDULED
  POSTING
  PUBLISHED
  FAILED
  CANCELLED
}

enum ModerationActionType {
  APPROVE
  REJECT
  EDIT
  DELETE
  PUBLISH
  UNPUBLISH
}

enum QueueStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

enum UserRole {
  VIEWER
  EDITOR
  MODERATOR
  ADMIN
  SUPER_ADMIN
}

enum ConfigType {
  STRING
  NUMBER
  BOOLEAN
  JSON
  ENCRYPTED
}
```

---

## Entity Relationships

### Entity Relationship Diagram

```mermaid
erDiagram
    Source ||--o{ Article : "has many"
    Source ||--o{ CrawlLog : "has many"
    Category ||--o{ Article : "categorizes"
    Category ||--o{ Category : "parent-child"
    Article ||--o{ ArticleVersion : "has versions"
    Article ||--o{ TelegramPost : "published as"
    Article ||--o{ CrawlError : "has errors"
    Article ||--o{ ModerationAction : "moderated by"
    Article ||--o{ ModerationQueue : "queued for"
    User ||--o{ ApiKey : "owns"
    User ||--o{ AuditLog : "performs"
    Article }o--|| Article : "duplicate of"
    Source }o--|| Source : "parent category"
```

### Relationship Types

**One-to-Many:**
- Source → Articles (one source can have many articles)
- Source → CrawlLogs (one source can have many crawl logs)
- Category → Articles (one category can contain many articles)
- Category → Category (one category can have child categories)
- Article → ArticleVersions (one article can have multiple versions)
- Article → TelegramPosts (one article can be published to multiple channels)
- Article → CrawlErrors (one article can have multiple crawl errors)
- Article → ModerationActions (one article can have multiple moderation actions)
- User → ApiKeys (one user can have multiple API keys)
- User → AuditLogs (one user can perform multiple actions)

**Many-to-One:**
- Article → Source (many articles belong to one source)
- Article → Category (many articles belong to one category)
- ArticleVersion → Article (many versions belong to one article)
- TelegramPost → Article (many posts can reference one article)
- CrawlError → Article (many errors can belong to one article)
- ModerationAction → Article (many actions can be performed on one article)
- ApiKey → User (many API keys can belong to one user)
- AuditLog → User (many logs can belong to one user)

**One-to-One:**
- Article → Article (self-reference for duplicates)
- ModerationQueue → Article (one article can be in moderation queue once)

**Many-to-Many:**
- Articles ↔ Tags (implemented via array field in Prisma)

---

## Indexes and Performance

### Primary Indexes

```sql
-- Primary keys are automatically created by Prisma
-- All primary keys use autoincrement integers for optimal performance
```

### Foreign Key Indexes

```sql
-- Source foreign keys
CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_crawl_logs_source_id ON crawl_logs(source_id);
CREATE INDEX idx_source_performance_source_id ON source_performance(source_id);

-- Category foreign keys
CREATE INDEX idx_articles_category_id ON articles(category_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- User foreign keys
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Article foreign keys
CREATE INDEX idx_article_versions_article_id ON article_versions(article_id);
CREATE INDEX idx_telegram_posts_article_id ON telegram_posts(article_id);
CREATE INDEX idx_crawl_errors_article_id ON crawl_errors(article_id);
CREATE INDEX idx_moderation_actions_article_id ON moderation_actions(article_id);
```

### Performance Indexes

```sql
-- Article performance indexes
CREATE INDEX idx_articles_status ON articles(status) WHERE status IN ('pending', 'approved');
CREATE INDEX idx_articles_published_at ON articles(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_articles_created_at ON articles(created_at DESC);
CREATE INDEX idx_articles_duplicate_of ON articles(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX idx_articles_telegram_message_id ON articles(telegram_message_id) WHERE telegram_message_id IS NOT NULL;

-- Tag search index (GIN index for array)
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);

-- Source health monitoring
CREATE INDEX idx_sources_is_active ON sources(is_active) WHERE is_active = true;
CREATE INDEX idx_sources_last_fetched_at ON sources(last_fetched_at);
CREATE INDEX idx_sources_health_score ON sources(health_score);

-- Telegram post management
CREATE INDEX idx_telegram_posts_channel_id ON telegram_posts(channel_id);
CREATE INDEX idx_telegram_posts_message_id ON telegram_posts(message_id);
CREATE INDEX idx_telegram_posts_scheduled_for ON telegram_posts(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_telegram_posts_status ON telegram_posts(status);

-- Moderation queue
CREATE INDEX idx_moderation_queue_status ON moderation_queue(status);
CREATE INDEX idx_moderation_queue_priority ON moderation_queue(priority DESC);
CREATE INDEX idx_moderation_queue_assigned_to ON moderation_queue(assigned_to) WHERE assigned_to IS NOT NULL;

-- Analytics indexes
CREATE INDEX idx_daily_stats_date ON daily_stats(date);
CREATE INDEX idx_source_performance_date ON source_performance(date);

-- Trending topics
CREATE INDEX idx_trending_topics_mention_count ON trending_topics(mention_count DESC);
CREATE INDEX idx_trending_topics_velocity ON trending_topics(velocity DESC) WHERE velocity IS NOT NULL;
CREATE INDEX idx_trending_topics_is_active ON trending_topics(is_active) WHERE is_active = true;

-- User management
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_active ON users(is_active);

-- API key management
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- System configuration
CREATE INDEX idx_system_configs_key ON system_configs(key);
CREATE INDEX idx_system_configs_is_public ON system_configs(is_public);

-- Audit logs
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### Composite Indexes

```sql
-- Article filtering by source and status
CREATE INDEX idx_articles_source_status ON articles(source_id, status);

-- Article filtering by category and status
CREATE INDEX idx_articles_category_status ON articles(category_id, status);

-- Moderation queue by status and priority
CREATE INDEX idx_moderation_queue_status_priority ON moderation_queue(status, priority DESC);

-- Source performance tracking
CREATE INDEX idx_source_performance_source_date ON source_performance(source_id, date DESC);

-- Daily stats with date range queries
CREATE INDEX idx_daily_stats_date_range ON daily_stats(date DESC);

-- Crawl log analysis
CREATE INDEX idx_crawl_logs_source_started ON crawl_logs(source_id, started_at DESC);
```

### Full-Text Search Indexes

```sql
-- Article title full-text search
CREATE INDEX idx_articles_title_fts ON articles USING GIN(to_tsvector('russian', original_title));

-- Article summary full-text search
CREATE INDEX idx_articles_summary_fts ON articles USING GIN(to_tsvector('russian', COALESCE(summary, '')));

-- Combined full-text search
CREATE INDEX idx_articles_content_fts ON articles USING GIN(
  to_tsvector('russian', COALESCE(original_title, '') || ' ' || COALESCE(summary, ''))
);

-- Category name search
CREATE INDEX idx_categories_name_fts ON categories USING GIN(to_tsvector('russian', name));

-- Source name search
CREATE INDEX idx_sources_name_fts ON sources USING GIN(to_tsvector('russian', name));
```

### Partial Indexes for Common Queries

```sql
-- Pending articles that need processing
CREATE INDEX idx_articles_pending_processing ON articles(id, status, created_at) 
WHERE status = 'pending';

-- Articles ready for publishing
CREATE INDEX idx_articles_ready_publish ON articles(id, category_id) 
WHERE status = 'approved' AND telegram_message_id IS NULL;

-- Failed articles that need retry
CREATE INDEX idx_articles_failed_retry ON articles(id, status, updated_at) 
WHERE status = 'failed';

-- Active sources for RSS fetching
CREATE INDEX idx_sources_active_fetching ON sources(id, last_fetched_at) 
WHERE is_active = true;

-- Recent audit logs
CREATE INDEX idx_audit_logs_recent ON audit_logs(id, created_at) 
WHERE created_at > NOW() - INTERVAL '7 days';
```

---

## Database Constraints

### Unique Constraints

```sql
-- Source uniqueness
ALTER TABLE sources ADD CONSTRAINT sources_url_unique UNIQUE (url);

-- Article uniqueness
ALTER TABLE articles ADD CONSTRAINT articles_original_url_unique UNIQUE (original_url);

-- Category uniqueness
ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name);
ALTER TABLE categories ADD CONSTRAINT categories_slug_unique UNIQUE (slug);

-- User uniqueness
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- API key uniqueness
ALTER TABLE api_keys ADD CONSTRAINT api_keys_key_unique UNIQUE (key);

-- System config uniqueness
ALTER TABLE system_configs ADD CONSTRAINT system_configs_key_unique UNIQUE (key);

-- Daily stats uniqueness
ALTER TABLE daily_stats ADD CONSTRAINT daily_stats_date_unique UNIQUE (date);

-- Source performance uniqueness
ALTER TABLE source_performance ADD CONSTRAINT source_performance_unique UNIQUE (source_id, date);

-- Moderation queue uniqueness
ALTER TABLE moderation_queue ADD CONSTRAINT moderation_queue_article_unique UNIQUE (article_id);
```

### Check Constraints

```sql
-- Source health score range
ALTER TABLE sources ADD CONSTRAINT sources_health_score_range 
CHECK (health_score >= 0 AND health_score <= 100);

-- Article quality score range
ALTER TABLE articles ADD CONSTRAINT articles_quality_score_range 
CHECK (quality_score >= 0 AND quality_score <= 1);

-- Article similarity score range
ALTER TABLE articles ADD CONSTRAINT articles_similarity_score_range 
CHECK (similarity_score >= 0 AND similarity_score <= 1);

-- Telegram post status flow
ALTER TABLE telegram_posts ADD CONSTRAINT telegram_posts_retry_count_range 
CHECK (retry_count >= 0 AND retry_count <= max_retries);

-- Daily stats non-negative
ALTER TABLE daily_stats ADD CONSTRAINT daily_stats_non_negative 
CHECK (
  articles_total >= 0 AND
  articles_published >= 0 AND
  articles_rejected >= 0 AND
  sources_active >= 0 AND
  ai_requests_total >= 0 AND
  telegram_posts_total >= 0
);

-- Source performance metrics
ALTER TABLE source_performance ADD CONSTRAINT source_performance_success_rate_range 
CHECK (success_rate >= 0 AND success_rate <= 1);
```

### Foreign Key Constraints

```sql
-- Article references
ALTER TABLE articles ADD CONSTRAINT articles_source_id_fkey 
FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;

ALTER TABLE articles ADD CONSTRAINT articles_category_id_fkey 
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE articles ADD CONSTRAINT articles_duplicate_of_fkey 
FOREIGN KEY (duplicate_of) REFERENCES articles(id) ON DELETE SET NULL;

-- Article version references
ALTER TABLE article_versions ADD CONSTRAINT article_versions_article_id_fkey 
FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- Telegram post references
ALTER TABLE telegram_posts ADD CONSTRAINT telegram_posts_article_id_fkey 
FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- Crawl log references
ALTER TABLE crawl_logs ADD CONSTRAINT crawl_logs_source_id_fkey 
FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;

-- Crawl error references
ALTER TABLE crawl_errors ADD CONSTRAINT crawl_errors_article_id_fkey 
FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- Moderation action references
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_article_id_fkey 
FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- Moderation queue references
ALTER TABLE moderation_queue ADD CONSTRAINT moderation_queue_article_id_fkey 
FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- User references
ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Category hierarchy
ALTER TABLE categories ADD CONSTRAINT categories_parent_id_fkey 
FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
```

---

## Migration Strategy

### Prisma Migration Workflow

```typescript
// Prisma migration commands
const MIGRATION_COMMANDS = {
  // Create new migration
  create: 'npx prisma migrate dev --name <migration_name>',
  
  // Apply migrations in production
  apply: 'npx prisma migrate deploy',
  
  // Generate Prisma client
  generate: 'npx prisma generate',
  
  // Reset database (development only)
  reset: 'npx prisma migrate reset',
  
  // Studio (database GUI)
  studio: 'npx prisma studio',
  
  // Format schema
  format: 'npx prisma format',
  
  // Validate schema
  validate: 'npx prisma validate'
};
```

### Migration Best Practices

```typescript
// Migration naming convention
const MIGRATION_NAMING = {
  pattern: '<timestamp>_<description>',
  examples: [
    '20240117120000_add_article_duplicates_table',
    '20240117120001_add_telegram_message_id_to_articles',
    '20240117120002_create_daily_stats_materialized_view',
    '20240117120003_add_full_text_search_indexes'
  ]
};

// Migration development workflow
class MigrationWorkflow {
  async createMigration(description: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, -5);
    const migrationName = `${timestamp}_${description.replace(/\s+/g, '_')}`;
    
    // 1. Update Prisma schema
    // 2. Create migration
    await exec(`npx prisma migrate dev --name ${migrationName}`);
    
    // 3. Review generated migration
    // 4. Test migration in development
    // 5. Commit both schema and migration
  }
  
  async applyToProduction(): Promise<void> {
    // 1. Backup database
    await this.backupDatabase();
    
    // 2. Apply migration
    await exec('npx prisma migrate deploy');
    
    // 3. Regenerate Prisma client
    await exec('npx prisma generate');
    
    // 4. Restart application
    await this.restartApplication();
  }
  
  async rollback(migrationName: string): Promise<void> {
    // Prisma doesn't support automatic rollbacks
    // Create manual rollback migration
    const rollbackName = `${migrationName}_rollback`;
    await this.createManualRollback(rollbackName);
    await this.applyToProduction();
  }
}
```

### Data Migration Patterns

```typescript
// Data migration for existing articles
async function migrateArticleData(): Promise<void> {
  // Phase 1: Backfill missing data
  await prisma.$executeRaw`
    UPDATE articles 
    SET status = 'pending' 
    WHERE status IS NULL
  `;
  
  // Phase 2: Migrate to new schema structure
  await prisma.$executeRaw`
    UPDATE articles 
    SET key_points = ARRAY[]::TEXT[]
    WHERE key_points IS NULL
  `;
  
  // Phase 3: Create article versions for audit trail
  const articles = await prisma.article.findMany({
    where: { created_at: { lt: new Date() } },
    take: 1000
  });
  
  for (const article of articles) {
    await prisma.articleVersion.create({
      data: {
        article_id: article.id,
        snapshot: article,
        changes: { initial: true },
        changed_by: 'system',
        change_reason: 'Initial migration version'
      }
    });
  }
  
  // Phase 4: Update indexes in batches
  await prisma.$executeRaw`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_tags 
    ON articles USING GIN(tags)
  `;
}

// Migration for source performance tracking
async function initializeSourcePerformance(): Promise<void> {
  const sources = await prisma.source.findMany({ where: { is_active: true } });
  
  for (const source of sources) {
    // Initialize last 30 days of performance data
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      await prisma.sourcePerformance.upsert({
        where: {
          source_id_date: {
            source_id: source.id,
            date: date
          }
        },
        create: {
          source_id: source.id,
          date: date
        },
        update: {}
      });
    }
  }
}
```

### Database Backup Strategy

```typescript
// Automated backup system
class DatabaseBackup {
  async createBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const backupFile = `/backups/news_intelligence_${timestamp}.sql`;
    
    try {
      // 1. Create database dump
      await exec(`pg_dump -U ${process.env.DB_USER} -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} ${process.env.DB_NAME} > ${backupFile}`);
      
      // 2. Compress backup
      await exec(`gzip ${backupFile}`);
      
      // 3. Upload to cloud storage (optional)
      if (process.env.BACKUP_S3_BUCKET) {
        await this.uploadToS3(`${backupFile}.gz`, process.env.BACKUP_S3_BUCKET);
      }
      
      // 4. Clean old backups (keep last 30 days)
      await this.cleanOldBackups(30);
      
      return {
        success: true,
        file: `${backupFile}.gz`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error({ error }, 'Backup failed');
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }
  
  async restoreBackup(backupFile: string): Promise<boolean> {
    try {
      // 1. Download backup from cloud (if needed)
      if (!backupFile.startsWith('/')) {
        backupFile = await this.downloadFromS3(backupFile);
      }
      
      // 2. Decompress backup
      const decompressed = backupFile.replace('.gz', '');
      await exec(`gunzip -c ${backupFile} > ${decompressed}`);
      
      // 3. Stop application
      await this.stopApplication();
      
      // 4. Restore database
      await exec(`psql -U ${process.env.DB_USER} -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} ${process.env.DB_NAME} < ${decompressed}`);
      
      // 5. Restart application
      await this.startApplication();
      
      // 6. Clean up
      await fs.unlink(decompressed);
      
      return true;
    } catch (error) {
      logger.error({ error }, 'Restore failed');
      return false;
    }
  }
}
```

---

## Performance Considerations

### Query Optimization

```typescript
// Optimized queries with proper indexing
class ArticleRepository {
  // Get pending articles for moderation
  async getPendingArticles(limit: number = 50, offset: number = 0): Promise<Article[]> {
    return await prisma.article.findMany({
      where: { status: 'pending' },
      include: {
        source: true,
        category: true
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset
    });
  }
  
  // Get articles by category with pagination
  async getArticlesByCategory(categoryId: number, page: number = 1, pageSize: number = 20): Promise<PaginatedResult<Article>> {
    const skip = (page - 1) * pageSize;
    
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          category_id: categoryId,
          status: 'published'
        },
        include: {
          source: true,
          category: true
        },
        orderBy: { published_at: 'desc' },
        take: pageSize,
        skip
      }),
      prisma.article.count({
        where: {
          category_id: categoryId,
          status: 'published'
        }
      })
    ]);
    
    return {
      data: articles,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }
  
  // Search articles with full-text search
  async searchArticles(query: string, filters: SearchFilters): Promise<Article[]> {
    // Use PostgreSQL full-text search
    const searchQuery = prisma.$queryRaw<Article[]>`
      SELECT 
        a.*,
        ts_rank(
          to_tsvector('russian', a.original_title || ' ' || COALESCE(a.summary, '')),
          plainto_tsquery('russian', ${query})
        ) as rank
      FROM articles a
      WHERE 
        a.status = 'published' AND
        to_tsvector('russian', a.original_title || ' ' || COALESCE(a.summary, '')) @@ 
        plainto_tsquery('russian', ${query})
        ${filters.category_id ? Prisma.sql`AND a.category_id = ${filters.category_id}` : Prisma.empty}
        ${filters.source_id ? Prisma.sql`AND a.source_id = ${filters.source_id}` : Prisma.empty}
      ORDER BY rank DESC, a.published_at DESC
      LIMIT 50
    `;
    
    return searchQuery;
  }
  
  // Get trending articles
  async getTrendingArticles(timeframe: string = '24h'): Promise<Article[]> {
    const timeframeDate = new Date();
    switch (timeframe) {
      case '1h': timeframeDate.setHours(timeframeDate.getHours() - 1); break;
      case '24h': timeframeDate.setHours(timeframeDate.getHours() - 24); break;
      case '7d': timeframeDate.setDate(timeframeDate.getDate() - 7); break;
      case '30d': timeframeDate.setDate(timeframeDate.getDate() - 30); break;
    }
    
    return await prisma.article.findMany({
      where: {
        status: 'published',
        created_at: { gte: timeframeDate }
      },
      include: {
        source: true,
        category: true
      },
      orderBy: { views: 'desc' },
      take: 20
    });
  }
}
```

### Connection Pool Management

```typescript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['query', 'error', 'warn'],
  errorFormat: 'minimal',
  
  // Connection pool settings
  // These are configured via DATABASE_URL connection string parameters
  // Example: postgresql://user:password@host:port/database?connection_limit=10&pool_timeout=20
});

// Connection pool monitoring
class ConnectionPoolMonitor {
  async getPoolStats(): Promise<PoolStats> {
    const result = await prisma.$queryRaw<PoolStats>`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    return result[0];
  }
  
  async killLongRunningQueries(maxDuration: number = 300000): Promise<void> {
    await prisma.$queryRaw`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE 
        state = 'active' AND
        query_start < NOW() - INTERVAL '5 minutes' AND
        pid != pg_backend_pid()
    `;
  }
}
```

### Database Monitoring

```typescript
// Database health monitoring
class DatabaseHealthMonitor {
  async checkHealth(): Promise<HealthCheckResult> {
    const checks: Record<string, boolean> = {};
    const metrics: Record<string, any> = {};
    
    try {
      // 1. Connection test
      await prisma.$queryRaw`SELECT 1`;
      checks.connection = true;
      
      // 2. Query performance test
      const start = Date.now();
      await prisma.article.findFirst({ where: { id: 1 } });
      metrics.query_latency = Date.now() - start;
      checks.query_performance = metrics.query_latency < 100;
      
      // 3. Connection pool status
      const poolStats = await this.getPoolStats();
      metrics.pool_stats = poolStats;
      checks.pool_health = poolStats.total_connections < 50;
      
      // 4. Database size
      const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;
      metrics.database_size = dbSize[0].size;
      
      // 5. Table sizes
      const tableSizes = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `;
      metrics.table_sizes = tableSizes;
      
      // 6. Index usage
      const indexUsage = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 20
      `;
      metrics.index_usage = indexUsage;
      
      // 7. Slow queries
      const slowQueries = await prisma.$queryRaw`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          max_time
        FROM pg_stat_statements
        WHERE mean_time > 100
        ORDER BY mean_time DESC
        LIMIT 10
      `;
      metrics.slow_queries = slowQueries;
      
      return {
        healthy: Object.values(checks).every(check => check === true),
        checks,
        metrics,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return {
        healthy: false,
        checks: { connection: false },
        metrics: {},
        timestamp: new Date()
      };
    }
  }
}
```

### Data Archival Strategy

```typescript
// Data archival for old articles
class DataArchival {
  async archiveOldArticles(daysOld: number = 365): Promise<ArchivalResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    try {
      // 1. Count articles to archive
      const count = await prisma.article.count({
        where: {
          created_at: { lt: cutoffDate },
          status: { in: ['published', 'rejected'] }
        }
      });
      
      if (count === 0) {
        return { success: true, archived: 0, message: 'No articles to archive' };
      }
      
      // 2. Create archive table if not exists
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS articles_archive AS 
        SELECT * FROM articles WHERE FALSE
      `;
      
      // 3. Copy articles to archive
      await prisma.$executeRaw`
        INSERT INTO articles_archive
        SELECT * FROM articles
        WHERE created_at < ${cutoffDate}
        AND status IN ('published', 'rejected')
      `;
      
      // 4. Delete from main table
      await prisma.article.deleteMany({
        where: {
          created_at: { lt: cutoffDate },
          status: { in: ['published', 'rejected'] }
        }
      });
      
      // 5. Vacuum to reclaim space
      await prisma.$executeRaw`VACUUM ANALYZE articles`;
      
      return {
        success: true,
        archived: count,
        message: `Archived ${count} articles older than ${daysOld} days`
      };
    } catch (error) {
      logger.error({ error }, 'Archival failed');
      return {
        success: false,
        archived: 0,
        error: error.message
      };
    }
  }
  
  async restoreFromArchive(articleId: number): Promise<boolean> {
    try {
      // 1. Check if article exists in archive
      const archived = await prisma.$queryRaw`
        SELECT * FROM articles_archive WHERE id = ${articleId}
      `;
      
      if (!archived || archived.length === 0) {
        return false;
      }
      
      // 2. Restore to main table
      await prisma.$executeRaw`
        INSERT INTO articles SELECT * FROM articles_archive WHERE id = ${articleId}
      `;
      
      // 3. Remove from archive
      await prisma.$executeRaw`
        DELETE FROM articles_archive WHERE id = ${articleId}
      `;
      
      return true;
    } catch (error) {
      logger.error({ error, articleId }, 'Restore from archive failed');
      return false;
    }
  }
}
```

---

## Summary

This database design provides a robust, scalable foundation for the AI News Intelligence Platform with the following key characteristics:

**Core Principles:**
- **Normalization**: Proper entity relationships to avoid data duplication
- **Indexing Strategy**: Comprehensive indexing for common query patterns
- **Data Integrity**: Foreign keys, unique constraints, and check constraints
- **Audit Trail**: Article versions and audit logs for complete tracking
- **Performance Optimized**: Query optimization, connection pooling, and monitoring

**Key Features:**
- **Article Management**: Complete article lifecycle from extraction to publishing
- **Source Management**: Health monitoring, performance tracking, and reliability
- **Moderation System**: Full audit trail and manual approval workflow
- **User Management**: Role-based access control and API key authentication
- **Analytics**: Daily statistics, source performance, and trending topics
- **Telegram Integration**: Message tracking and engagement monitoring

**Scalability Considerations:**
- **Partitioning**: Ready for table partitioning by date for large datasets
- **Archival**: Built-in archival strategy for old data
- **Read Replicas**: Schema supports read replica deployment
- **Connection Pooling**: Proper pool management for high concurrency
- **Query Optimization**: Indexes and query patterns optimized for scale

**Maintenance:**
- **Migration Strategy**: Prisma-based migration workflow
- **Backup System**: Automated backup and restore functionality
- **Health Monitoring**: Comprehensive database health checks
- **Performance Monitoring**: Query performance and connection pool tracking

This database design supports the MVP phase while providing clear paths for scaling to handle 100+ sources and millions of articles.