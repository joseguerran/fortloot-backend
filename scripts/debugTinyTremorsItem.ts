import { prisma } from '../src/database/client';

async function debugTinyTremorsItem() {
  console.log('🔍 Searching for EID_TinyTremors in database...\n');

  // Search by various fields
  const results = await prisma.catalogItem.findMany({
    where: {
      OR: [
        { itemId: { contains: 'TinyTremors', mode: 'insensitive' } },
        { name: { contains: 'Tiny', mode: 'insensitive' } },
        { description: { contains: 'Tiny', mode: 'insensitive' } },
      ],
    },
    take: 10,
  });

  if (results.length === 0) {
    console.log('❌ No items found matching "Tiny" or "TinyTremors"');

    // Show last 5 items in catalog
    const lastItems = await prisma.catalogItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('\n📊 Last 5 items added to catalog:');
    lastItems.forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.name}`);
      console.log(`   itemId: ${item.itemId}`);
      console.log(`   type: ${item.type}`);
      console.log(`   baseVbucks: ${item.baseVbucks}`);
    });
  } else {
    console.log(`✅ Found ${results.length} item(s):\n`);

    results.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name}`);
      console.log(`   ID (database): ${item.id}`);
      console.log(`   itemId (Fortnite): ${item.itemId}`);
      console.log(`   offerId: ${item.offerId}`);
      console.log(`   type: ${item.type}`);
      console.log(`   baseVbucks: ${item.baseVbucks}`);
      console.log(`   isActive: ${item.isActive}`);
      console.log(`   isCustom: ${item.isCustom}`);
      console.log(`   rarity: ${item.rarity}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

debugTinyTremorsItem().catch(console.error);
