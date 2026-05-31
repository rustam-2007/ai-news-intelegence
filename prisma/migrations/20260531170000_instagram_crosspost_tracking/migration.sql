CREATE TYPE "InstagramCrosspostStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'SKIPPED');

ALTER TABLE "articles"
ADD COLUMN "instagram_post_id" VARCHAR(255),
ADD COLUMN "instagram_posted_at" TIMESTAMP(3),
ADD COLUMN "instagram_post_error" TEXT,
ADD COLUMN "instagram_post_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "instagram_crosspost_status" "InstagramCrosspostStatus";

CREATE INDEX "articles_instagram_crosspost_status_idx" ON "articles"("instagram_crosspost_status");
CREATE INDEX "articles_instagram_posted_at_idx" ON "articles"("instagram_posted_at" DESC);
