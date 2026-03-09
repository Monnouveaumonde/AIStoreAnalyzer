/**
 * prisma/test-connection.ts
 *
 * Script de test de connexion Prisma Accelerate → PostgreSQL.
 *
 * Exécution :
 *   npx tsx prisma/test-connection.ts
 *   (ou : npm run db:test)
 *
 * Ce script teste :
 *  1. La connexion via Prisma Accelerate (protocole prisma+postgres://)
 *  2. Les opérations CRUD sur Store, Competitor, SeoAudit
 *  3. Le cache Accelerate (cacheStrategy)
 *  4. Nettoie les données de test en fin de script
 */

import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Client de test — identique à db.server.ts
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
}).$extends(withAccelerate());

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🚀 Test Prisma Accelerate → PostgreSQL");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("🔑 URL utilisée :", process.env.DATABASE_URL?.substring(0, 60) + "...\n");

  // ── 1. Test connexion ─────────────────────────────────────────────────
  console.log("1️⃣  Connexion à Prisma Accelerate...");
  await prisma.$connect();
  console.log("   ✅ Connexion établie !\n");

  // ── 2. Créer un Store de test ─────────────────────────────────────────
  console.log("2️⃣  Création d'un Store de test...");
  const testShop = `test-${Date.now()}.myshopify.com`;
  const store = await prisma.store.create({
    data: { shop: testShop },
  });
  console.log(`   ✅ Store créé — ID: ${store.id}, shop: ${store.shop}\n`);

  // ── 3. Créer un Competitor ────────────────────────────────────────────
  console.log("3️⃣  Création d'un Competitor...");
  const competitor = await prisma.competitor.create({
    data: {
      storeId: store.id,
      url: "https://www.exemple-concurrent.fr/produit/chaussures-running",
    },
  });
  console.log(`   ✅ Competitor créé — ID: ${competitor.id}\n`);

  // ── 4. Créer un SeoAudit ──────────────────────────────────────────────
  console.log("4️⃣  Création d'un SeoAudit...");
  const audit = await prisma.seoAudit.create({
    data: {
      storeId: store.id,
      score: 74.5,
      report: {
        overallScore: 74.5,
        metaTitles:       { total: 50, missing: 4,  score: 92 },
        metaDescriptions: { total: 50, missing: 8,  score: 84 },
        altTexts:         { total: 130, missing: 18, score: 86 },
        h1:               { missing: 3, multiple: 0, score: 94 },
        duplicates:       { count: 2, score: 96 },
        generatedAt:      new Date().toISOString(),
      },
    },
  });
  console.log(`   ✅ SeoAudit créé — ID: ${audit.id}, score: ${audit.score}\n`);

  // ── 5. Lecture avec cache Accelerate ─────────────────────────────────
  console.log("5️⃣  Lecture avec cache Accelerate (staleWhileRevalidate 60s)...");
  const storeWithRelations = await prisma.store.findUnique({
    where: { id: store.id },
    include: {
      competitors: true,
      seoAudits:   true,
    },
    // Le cache Accelerate : retourne la donnée en cache si <60s,
    // re-fetch en arrière-plan si entre 60s et 300s
    cacheStrategy: { swr: 60, ttl: 300 },
  } as any);

  console.log("   ✅ Store récupéré avec relations :");
  console.log(`      - ${storeWithRelations?.competitors.length} concurrent(s)`);
  console.log(`      - ${storeWithRelations?.seoAudits.length} audit(s) SEO\n`);

  // ── 6. Comptage global ────────────────────────────────────────────────
  console.log("6️⃣  Comptage global des enregistrements...");
  const [stores, competitors, audits] = await Promise.all([
    prisma.store.count(),
    prisma.competitor.count(),
    prisma.seoAudit.count(),
  ]);
  console.log(`   Stores      : ${stores}`);
  console.log(`   Competitors : ${competitors}`);
  console.log(`   SeoAudits   : ${audits}\n`);

  // ── 7. Test upsert ────────────────────────────────────────────────────
  console.log("7️⃣  Test upsert (findOrCreate pattern)...");
  const upserted = await prisma.store.upsert({
    where: { shop: testShop },
    update: {},
    create: { shop: testShop },
  });
  console.log(`   ✅ Upsert OK — même ID: ${upserted.id === store.id}\n`);

  // ── 8. Nettoyage ──────────────────────────────────────────────────────
  console.log("8️⃣  Nettoyage des données de test...");
  await prisma.store.delete({ where: { id: store.id } });
  // La cascade supprime automatiquement competitor et seoAudit liés
  console.log("   ✅ Données supprimées (cascade OK)\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🎉 Tous les tests réussis !");
  console.log("     Prisma Accelerate fonctionne parfaitement.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Erreur Prisma :");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("🔌 Connexion Prisma fermée.");
  });
