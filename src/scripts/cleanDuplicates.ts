import { prisma } from '../database/client';

async function cleanDuplicates() {
  try {
    console.log('🧹 Cleaning duplicate catalog items...');

    // Get all custom items
    const items = await prisma.catalogItem.findMany({
      where: { isCustom: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by name
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.name]) {
        acc[item.name] = [];
      }
      acc[item.name].push(item);
      return acc;
    }, {} as Record<string, typeof items>);

    let deleted = 0;

    // Delete duplicates (keep the first one)
    for (const [name, duplicates] of Object.entries(grouped)) {
      if (duplicates.length > 1) {
        console.log(`Found ${duplicates.length} duplicates for: ${name}`);

        // Keep the first one, delete the rest
        const toDelete = duplicates.slice(1);

        for (const item of toDelete) {
          // First, delete from DailyCatalogItem
          await prisma.dailyCatalogItem.deleteMany({
            where: { itemId: item.id },
          });

          // Then delete the catalog item
          await prisma.catalogItem.delete({
            where: { id: item.id },
          });
          deleted++;
          console.log(`  ❌ Deleted duplicate: ${item.id}`);
        }
      }
    }

    console.log(`\n✅ Cleanup complete: ${deleted} duplicates removed`);

    // Verify
    const remaining = await prisma.catalogItem.count({
      where: { isCustom: true },
    });

    console.log(`📊 Remaining custom items: ${remaining}`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning duplicates:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

cleanDuplicates();
