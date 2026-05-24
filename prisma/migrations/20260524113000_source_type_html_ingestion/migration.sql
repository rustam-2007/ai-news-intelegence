CREATE TYPE "SourceType" AS ENUM ('RSS', 'HTML');

ALTER TABLE "sources" ADD COLUMN "source_type" "SourceType" NOT NULL DEFAULT 'RSS';
ALTER TABLE "sources" ADD COLUMN "latest_page_url" VARCHAR(2048);
ALTER TABLE "sources" ALTER COLUMN "rss_url" DROP NOT NULL;

ALTER TABLE "articles" ADD COLUMN "image_url" VARCHAR(2048);
