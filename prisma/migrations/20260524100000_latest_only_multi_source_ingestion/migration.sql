ALTER TABLE "sources" ADD COLUMN "last_fetched_at" TIMESTAMP(3);
ALTER TABLE "sources" ADD COLUMN "latest_article_published_at" TIMESTAMP(3);
ALTER TABLE "sources" ADD COLUMN "last_success_at" TIMESTAMP(3);
ALTER TABLE "sources" ADD COLUMN "last_error" TEXT;

ALTER TABLE "articles" ADD COLUMN "ingested_via_latest_only" BOOLEAN NOT NULL DEFAULT false;
