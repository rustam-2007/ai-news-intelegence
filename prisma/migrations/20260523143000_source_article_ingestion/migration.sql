ALTER TABLE "sources" RENAME COLUMN "url" TO "base_url";
ALTER TABLE "sources" ADD COLUMN "fetch_interval_minutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "articles" RENAME COLUMN "original_title" TO "title";
ALTER TABLE "articles" RENAME COLUMN "original_url" TO "url";
ALTER TABLE "articles" RENAME COLUMN "original_content" TO "content";
ALTER TABLE "articles" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "articles" ADD COLUMN "content_hash" VARCHAR(64) NOT NULL DEFAULT '';

UPDATE "articles"
SET "content_hash" = md5(COALESCE("title", '') || '||' || COALESCE("content", '') || '||' || COALESCE("excerpt", ''));

ALTER TABLE "articles" ALTER COLUMN "content_hash" DROP DEFAULT;

ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_category_id_fkey";
DROP INDEX IF EXISTS "articles_category_id_idx";
DROP INDEX IF EXISTS "articles_telegram_message_id_idx";
DROP INDEX IF EXISTS "articles_original_url_key";

DROP TABLE IF EXISTS "telegram_posts";
DROP TABLE IF EXISTS "crawl_logs";
DROP TABLE IF EXISTS "moderation_queue";
DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "users";

ALTER TABLE "articles" DROP COLUMN IF EXISTS "author";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "summary";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "language";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "moderated_by";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "moderated_at";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "moderation_notes";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "telegram_message_id";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "telegram_channel_id";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "published_to_telegram_at";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "ai_model_summary";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "ai_model_category";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "ai_cost_cents";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "processing_time_ms";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "updated_at";

ALTER TYPE "ArticleStatus" RENAME TO "ArticleStatus_old";
CREATE TYPE "ArticleStatus" AS ENUM ('NEW', 'PROCESSING', 'PUBLISHED', 'FAILED');
ALTER TABLE "articles" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "articles" SET "status" = 'NEW' WHERE "status" IN ('EXTRACTING', 'PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "articles"
  ALTER COLUMN "status" TYPE "ArticleStatus"
  USING ("status"::text::"ArticleStatus");
ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "ArticleStatus_old";

ALTER TABLE "sources" DROP COLUMN IF EXISTS "last_fetched_at";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "last_success_at";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "health_score";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "error_count";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "consecutive_failures";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "rate_limit";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "description";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "language";

DROP TYPE IF EXISTS "TelegramPostStatus";
DROP TYPE IF EXISTS "QueueStatus";
DROP TYPE IF EXISTS "UserRole";

CREATE UNIQUE INDEX "sources_rss_url_key" ON "sources"("rss_url");
CREATE UNIQUE INDEX "articles_url_key" ON "articles"("url");
