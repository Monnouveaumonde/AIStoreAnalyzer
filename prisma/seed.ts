import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.benchmarkData.upsert({
    where: { category_metric: { category: "global", metric: "overall_score" } },
    update: { averageValue: 55, medianValue: 52, topPercentile: 85, sampleSize: 10000 },
    create: { category: "global", metric: "overall_score", averageValue: 55, medianValue: 52, topPercentile: 85, sampleSize: 10000 },
  });

  await prisma.benchmarkData.upsert({
    where: { category_metric: { category: "seo", metric: "seo_score" } },
    update: { averageValue: 58, medianValue: 55, topPercentile: 88, sampleSize: 10000 },
    create: { category: "seo", metric: "seo_score", averageValue: 58, medianValue: 55, topPercentile: 88, sampleSize: 10000 },
  });

  await prisma.benchmarkData.upsert({
    where: { category_metric: { category: "speed", metric: "speed_score" } },
    update: { averageValue: 45, medianValue: 42, topPercentile: 80, sampleSize: 10000 },
    create: { category: "speed", metric: "speed_score", averageValue: 45, medianValue: 42, topPercentile: 80, sampleSize: 10000 },
  });

  await prisma.benchmarkData.upsert({
    where: { category_metric: { category: "trust", metric: "trust_score" } },
    update: { averageValue: 50, medianValue: 48, topPercentile: 82, sampleSize: 10000 },
    create: { category: "trust", metric: "trust_score", averageValue: 50, medianValue: 48, topPercentile: 82, sampleSize: 10000 },
  });

  console.log("Benchmark data seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
