CREATE TYPE "FacebookCrosspostStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'SKIPPED');

ALTER TABLE "articles"
ADD COLUMN "facebook_post_id" VARCHAR(255),
ADD COLUMN "facebook_posted_at" TIMESTAMP(3),
ADD COLUMN "facebook_post_error" TEXT,
ADD COLUMN "facebook_post_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "facebook_crosspost_status" "FacebookCrosspostStatus";

CREATE INDEX "articles_facebook_crosspost_status_idx" ON "articles"("facebook_crosspost_status");
CREATE INDEX "articles_facebook_posted_at_idx" ON "articles"("facebook_posted_at" DESC);
