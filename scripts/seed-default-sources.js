const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const sources = [
  {
    name: 'Kun',
    sourceType: 'RSS',
    baseUrl: 'https://kun.uz',
    rssUrl: process.env.KUN_UZ_RSS_URL || 'https://kun.uz/news/rss',
    latestPageUrl: process.env.KUN_UZ_LATEST_PAGE_URL || 'https://kun.uz/news',
    isActive: true,
    fetchIntervalMinutes: Number(process.env.KUN_UZ_FETCH_INTERVAL_MINUTES || 15),
  },
  {
    name: 'Qalampir',
    sourceType: process.env.QALAMPIR_SOURCE_TYPE || 'RSS',
    baseUrl: 'https://qalampir.uz',
    rssUrl: process.env.QALAMPIR_RSS_URL || 'https://qalampir.uz/rss',
    latestPageUrl: process.env.QALAMPIR_LATEST_PAGE_URL || 'https://qalampir.uz/uz',
    isActive: true,
    fetchIntervalMinutes: Number(process.env.QALAMPIR_FETCH_INTERVAL_MINUTES || 15),
  },
  {
    name: 'Zamon',
    sourceType: 'HTML',
    baseUrl: 'https://zamon.uz',
    rssUrl: null,
    latestPageUrl: process.env.ZAMON_LATEST_PAGE_URL || 'https://zamon.uz/uz/news',
    isActive: true,
    fetchIntervalMinutes: Number(process.env.ZAMON_FETCH_INTERVAL_MINUTES || 15),
  },
];

async function seedSource(source) {
  const existing = await prisma.source.findFirst({
    where: {
      OR: [{ name: source.name }, { baseUrl: source.baseUrl }],
    },
  });

  if (existing) {
    await prisma.source.update({
      where: { id: existing.id },
      data: {
        sourceType: source.sourceType,
        rssUrl: source.rssUrl,
        latestPageUrl: source.latestPageUrl,
        isActive: source.isActive,
        fetchIntervalMinutes: source.fetchIntervalMinutes,
      },
    });
    console.log(`updated source ${source.name}`);
    return;
  }

  await prisma.source.create({
    data: source,
  });
  console.log(`created source ${source.name}`);
}

async function main() {
  for (const source of sources) {
    await seedSource(source);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
