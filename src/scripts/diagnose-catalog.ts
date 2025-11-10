import { prisma } from '../database/client';

async function diagnoseCatalog() {
  console.log('=== CATALOG DIAGNOSIS ===\n');

  // 1. Check total catalog items
  const totalItems = await prisma.catalogItem.count();
  const activeItems = await prisma.catalogItem.count({
    where: { isActive: true },
  });
  const customItems = await prisma.catalogItem.count({
    where: { isCustom: true, isActive: true },
  });
  const apiItems = await prisma.catalogItem.count({
    where: { isCustom: false, isActive: true },
  });

  console.log('📊 CATALOG ITEMS:');
  console.log(`  Total items: ${totalItems}`);
  console.log(`  Active items: ${activeItems}`);
  console.log(`  - API items (active): ${apiItems}`);
  console.log(`  - Custom items (active): ${customItems}`);
  console.log('');

  // 2. Check today's daily catalog
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyCatalog = await prisma.dailyCatalog.findUnique({
    where: { date: today },
    include: {
      items: {
        include: {
          item: true,
        },
      },
    },
  });

  console.log('📅 DAILY CATALOG (today):');
  if (dailyCatalog) {
    console.log(`  Date: ${dailyCatalog.date.toISOString()}`);
    console.log(`  Shop closes at: ${dailyCatalog.shopClosesAt.toISOString()}`);
    console.log(`  Total items in catalog: ${dailyCatalog.items.length}`);
    console.log(`  Active items in catalog: ${dailyCatalog.items.filter(i => i.item.isActive).length}`);
    console.log('');

    // Show breakdown by type
    const itemsByType: Record<string, number> = {};
    const activeByType: Record<string, number> = {};

    dailyCatalog.items.forEach((ci) => {
      const type = ci.item.type;
      itemsByType[type] = (itemsByType[type] || 0) + 1;
      if (ci.item.isActive) {
        activeByType[type] = (activeByType[type] || 0) + 1;
      }
    });

    console.log('  Items by type:');
    Object.entries(itemsByType).forEach(([type, count]) => {
      const activeCount = activeByType[type] || 0;
      console.log(`    ${type}: ${count} total (${activeCount} active)`);
    });
    console.log('');

    // Show sample items
    console.log('  Sample items (first 5):');
    dailyCatalog.items.slice(0, 5).forEach((ci, idx) => {
      console.log(`    ${idx + 1}. [${ci.item.isActive ? 'ACTIVE' : 'INACTIVE'}] ${ci.item.name} (${ci.item.type})`);
    });
    console.log('');
  } else {
    console.log('  ⚠️  NO DAILY CATALOG FOUND FOR TODAY!');
    console.log('');
  }

  // 3. Check what would be returned to frontend
  if (dailyCatalog) {
    const catalogItems = dailyCatalog.items.map((ci) => ci.item);
    const activeItemsForFrontend = catalogItems.filter((item) => item.isActive);

    console.log('🌐 FRONTEND WOULD RECEIVE:');
    console.log(`  Items after isActive filter: ${activeItemsForFrontend.length}`);
    console.log('');

    if (activeItemsForFrontend.length === 0) {
      console.log('❌ PROBLEM FOUND: No active items would be shown to frontend!');
      console.log('');
      console.log('Checking why items are inactive:');

      const inactiveItems = catalogItems.filter((item) => !item.isActive);
      console.log(`  Total inactive items: ${inactiveItems.length}`);

      if (inactiveItems.length > 0) {
        console.log('  Sample inactive items:');
        inactiveItems.slice(0, 5).forEach((item, idx) => {
          console.log(`    ${idx + 1}. ${item.name} (${item.type})`);
          console.log(`       - itemId: ${item.itemId}`);
          console.log(`       - isCustom: ${item.isCustom}`);
          console.log(`       - updatedAt: ${item.updatedAt.toISOString()}`);
        });
      }
    }
  }

  // 4. Check last sync info
  console.log('');
  console.log('🔄 RECENT UPDATES:');
  const recentUpdates = await prisma.catalogItem.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      name: true,
      type: true,
      isActive: true,
      isCustom: true,
      updatedAt: true,
    },
  });

  console.log('  Last 5 updated items:');
  recentUpdates.forEach((item, idx) => {
    console.log(`    ${idx + 1}. [${item.isActive ? 'ACTIVE' : 'INACTIVE'}] ${item.name} (${item.type})`);
    console.log(`       Updated: ${item.updatedAt.toISOString()}`);
  });

  await prisma.$disconnect();
}

diagnoseCatalog().catch((error) => {
  console.error('Error during diagnosis:', error);
  process.exit(1);
});
