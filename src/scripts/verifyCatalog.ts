import { prisma } from '../database/client';

async function verifyCatalog() {
  try {
    // Check catalog items
    const items = await prisma.catalogItem.findMany({
      where: { isCustom: true },
      select: {
        name: true,
        type: true,
        basePriceUsd: true,
        isActive: true,
      },
      orderBy: { type: 'asc' },
    });

    console.log('\n📦 Catalog Items Created:');
    console.log('========================');
    items.forEach((item) => {
      console.log(`- ${item.name} (${item.type}) - $${item.basePriceUsd}`);
    });

    // Group by type
    const byType = items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📊 Summary by Type:');
    console.log('==================');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`${type}: ${count} items`);
    });

    // Check today's catalog
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyCatalog = await prisma.dailyCatalog.findUnique({
      where: { date: today },
      include: {
        items: {
          include: {
            item: {
              select: { name: true, type: true },
            },
          },
        },
      },
    });

    if (dailyCatalog) {
      console.log(`\n📅 Today's Catalog`);
      console.log('========================');
      console.log(`Total items in catalog: ${dailyCatalog.items.length}`);
    } else {
      console.log('\n⚠️  No daily catalog found for today');
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error verifying catalog:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifyCatalog();
