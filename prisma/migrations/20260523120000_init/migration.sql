-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('NEW', 'EXTRACTING', 'PROCESSING', 'PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "TelegramPostStatus" AS ENUM ('PENDING', 'SCHEDULED', 'POSTING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'EDITOR', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "sources" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "rss_url" VARCHAR(2048) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_fetched_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "health_score" INTEGER NOT NULL DEFAULT 100,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "rate_limit" INTEGER NOT NULL DEFAULT 10,
    "description" TEXT,
    "language" VARCHAR(10) NOT NULL DEFAULT 'ru',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "original_title" VARCHAR(1000) NOT NULL,
    "original_url" VARCHAR(2048) NOT NULL,
    "original_content" TEXT,
    "published_at" TIMESTAMP(3),
    "author" VARCHAR(255),
    "summary" TEXT,
    "category_id" INTEGER,
    "tags" TEXT[],
    "language" VARCHAR(10),
    "status" "ArticleStatus" NOT NULL DEFAULT 'PENDING',
    "moderated_by" VARCHAR(255),
    "moderated_at" TIMESTAMP(3),
    "moderation_notes" TEXT,
    "telegram_message_id" INTEGER,
    "telegram_channel_id" VARCHAR(255),
    "published_to_telegram_at" TIMESTAMP(3),
    "ai_model_summary" VARCHAR(50),
    "ai_model_category" VARCHAR(50),
    "ai_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "processing_time_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "emoji" VARCHAR(10),
    "color" VARCHAR(7),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "telegram_channel_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_posts" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "channel_id" VARCHAR(255) NOT NULL,
    "message_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "image_id" VARCHAR(255),
    "scheduled_for" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "status" "TelegramPostStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_logs" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "article_id" INTEGER,
    "articles_found" INTEGER NOT NULL DEFAULT 0,
    "articles_processed" INTEGER NOT NULL DEFAULT 0,
    "articles_new" INTEGER NOT NULL DEFAULT 0,
    "articles_duplicates" INTEGER NOT NULL DEFAULT 0,
    "articles_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "error_type" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_queue" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to" VARCHAR(255),
    "assigned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "moderation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "permissions" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE INDEX "sources_is_active_idx" ON "sources"("is_active");

-- CreateIndex
CREATE INDEX "sources_last_fetched_at_idx" ON "sources"("last_fetched_at");

-- CreateIndex
CREATE INDEX "sources_health_score_idx" ON "sources"("health_score");

-- CreateIndex
CREATE UNIQUE INDEX "articles_original_url_key" ON "articles"("original_url");

-- CreateIndex
CREATE INDEX "articles_source_id_idx" ON "articles"("source_id");

-- CreateIndex
CREATE INDEX "articles_status_idx" ON "articles"("status");

-- CreateIndex
CREATE INDEX "articles_category_id_idx" ON "articles"("category_id");

-- CreateIndex
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at" DESC);

-- CreateIndex
CREATE INDEX "articles_created_at_idx" ON "articles"("created_at" DESC);

-- CreateIndex
CREATE INDEX "articles_telegram_message_id_idx" ON "articles"("telegram_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "telegram_posts_channel_id_idx" ON "telegram_posts"("channel_id");

-- CreateIndex
CREATE INDEX "telegram_posts_message_id_idx" ON "telegram_posts"("message_id");

-- CreateIndex
CREATE INDEX "telegram_posts_article_id_idx" ON "telegram_posts"("article_id");

-- CreateIndex
CREATE INDEX "telegram_posts_scheduled_for_idx" ON "telegram_posts"("scheduled_for");

-- CreateIndex
CREATE INDEX "telegram_posts_status_idx" ON "telegram_posts"("status");

-- CreateIndex
CREATE INDEX "crawl_logs_source_id_idx" ON "crawl_logs"("source_id");

-- CreateIndex
CREATE INDEX "crawl_logs_article_id_idx" ON "crawl_logs"("article_id");

-- CreateIndex
CREATE INDEX "crawl_logs_started_at_idx" ON "crawl_logs"("started_at" DESC);

-- CreateIndex
CREATE INDEX "crawl_logs_created_at_idx" ON "crawl_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_queue_article_id_key" ON "moderation_queue"("article_id");

-- CreateIndex
CREATE INDEX "moderation_queue_status_idx" ON "moderation_queue"("status");

-- CreateIndex
CREATE INDEX "moderation_queue_priority_idx" ON "moderation_queue"("priority" DESC);

-- CreateIndex
CREATE INDEX "moderation_queue_assigned_to_idx" ON "moderation_queue"("assigned_to");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_posts" ADD CONSTRAINT "telegram_posts_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_logs" ADD CONSTRAINT "crawl_logs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_logs" ADD CONSTRAINT "crawl_logs_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
