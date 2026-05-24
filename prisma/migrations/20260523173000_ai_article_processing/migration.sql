ALTER TYPE "ArticleStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE "articles" ADD COLUMN "rewritten_title_uz" VARCHAR(1000);
ALTER TABLE "articles" ADD COLUMN "summary_uz" TEXT;
ALTER TABLE "articles" ADD COLUMN "category" VARCHAR(100);
ALTER TABLE "articles" ADD COLUMN "ai_model" VARCHAR(100);
ALTER TABLE "articles" ADD COLUMN "processed_at" TIMESTAMP(3);
