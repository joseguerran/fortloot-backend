import { prisma } from '../database/client';

async function fixCatalogLinks() {
  console.log('=== FIXING CATALOG LINKS ===\n');

  // Get today's catalog
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let catalog = await prisma.dailyCatalog.findUnique({
    where: { date: today },
  });

  if (!catalog) {
    console.log('Creating daily catalog for today...');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(3, 0, 0, 0); // 3:00 AM next day (Fortnite shop rotation time)

    catalog = await prisma.dailyCatalog.create({
      data: {
        date: today,
        shopClosesAt: tomorrow,
      },
    });
    console.log(`✅ Created catalog: ${catalog.id}\n`);
  } else {
    console.log(`✅ Found catalog: ${catalog.id}\n`);
  }

  // Get all active items
  const activeItems = await prisma.catalogItem.findMany({
    where: { isActive: true },
  });

  console.log(`Found ${activeItems.length} active items to link\n`);

  let linked = 0;
  let alreadyLinked = 0;

  for (const item of activeItems) {
    const existing = await prisma.dailyCatalogItem.findUnique({
      where: {
        catalogId_itemId: {
          catalogId: catalog.id,
          itemId: item.id,
        },
      },
    });

    if (existing) {
      alreadyLinked++;
    } else {
      await prisma.dailyCatalogItem.create({
        data: {
          catalogId: catalog.id,
          itemId: item.id,
        },
      });
      linked++;
      console.log(`  ✅ Linked: ${item.name} (${item.type})`);
    }
  }

  console.log(`\n📊 RESULTS:`);
  console.log(`  Newly linked: ${linked}`);
  console.log(`  Already linked: ${alreadyLinked}`);
  console.log(`  Total: ${linked + alreadyLinked}`);

  // Verify
  const verification = await prisma.dailyCatalog.findUnique({
    where: { id: catalog.id },
    include: {
      items: {
        include: {
          item: true,
        },
      },
    },
  });

  const activeInCatalog = verification?.items.filter(i => i.item.isActive).length || 0;
  console.log(`\n✅ Verification: ${activeInCatalog} active items in today's catalog`);

  await prisma.$disconnect();
}

fixCatalogLinks().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
