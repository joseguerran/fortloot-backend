import { FortniteAPIService } from '../src/services/FortniteAPIService';
import { prisma } from '../src/database/client';

async function testCatalogSync() {
  console.log('🔍 Testing Catalog Sync\n');

  // 1. Fetch items from Fortnite API
  console.log('📡 Fetching items from Fortnite API...');
  let apiItems;
  try {
    apiItems = await FortniteAPIService.fetchItemShop();
    console.log(`✅ Fetched ${apiItems.length} items from API\n`);
  } catch (error: any) {
    console.error('❌ Failed to fetch from API:', error.message);
    process.exit(1);
  }

  // 2. Show first 10 items from API
  console.log('📊 First 10 items from API:');
  apiItems.slice(0, 10).forEach((item, i) => {
    console.log(`${i + 1}. ${item.name} (${item.type}) - ${item.baseVbucks} V-Bucks`);
    console.log(`   itemId: ${item.itemId}`);
    console.log(`   giftAllowed: ${item.giftAllowed}`);
  });

  // 3. Check if "Tiniest Violin" is in API response
  console.log('\n🔎 Searching for "Tiniest Violin" or "TinyTremors" in API...');
  const tinyItem = apiItems.find(item =>
    (item.itemId && item.itemId.includes('TinyTremors')) ||
    (item.name && item.name.toLowerCase().includes('tiny'))
  );

  if (tinyItem) {
    console.log('✅ FOUND in API:');
    console.log(`   Name: ${tinyItem.name}`);
    console.log(`   itemId: ${tinyItem.itemId}`);
    console.log(`   Type: ${tinyItem.type}`);
    console.log(`   Price: ${tinyItem.baseVbucks} V-Bucks`);
  } else {
    console.log('❌ NOT FOUND in current API response');
  }

  // 4. Check what's in database
  console.log('\n💾 Checking database...');
  const dbItems = await prisma.catalogItem.findMany({
    where: { isActive: true, isCustom: false },
    select: { id: true, itemId: true, name: true, type: true, baseVbucks: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  console.log(`\n📊 Last 10 ACTIVE items in database:`);
  dbItems.forEach((item, i) => {
    console.log(`${i + 1}. ${item.name} (${item.type}) - ${item.baseVbucks} V-Bucks`);
    console.log(`   itemId: ${item.itemId}`);
    console.log(`   updatedAt: ${item.updatedAt.toISOString()}`);
  });

  // 5. Check if TinyTremors is still active in DB
  const tinyInDb = await prisma.catalogItem.findFirst({
    where: { itemId: 'EID_TinyTremors' },
  });

  console.log('\n🔎 Checking EID_TinyTremors in database...');
  if (tinyInDb) {
    console.log(`✅ FOUND in database:`);
    console.log(`   Name: ${tinyInDb.name}`);
    console.log(`   isActive: ${tinyInDb.isActive}`);
    console.log(`   updatedAt: ${tinyInDb.updatedAt.toISOString()}`);
  } else {
    console.log('❌ NOT FOUND in database');
  }

  // 6. Compare API vs Database
  console.log('\n📊 Comparison Analysis:');
  const apiItemIds = new Set(apiItems.map(item => item.itemId));
  const dbActiveItems = await prisma.catalogItem.findMany({
    where: { isActive: true, isCustom: false },
  });

  const itemsInDbButNotApi = dbActiveItems.filter(item => item.itemId && !apiItemIds.has(item.itemId));
  const itemsInApiButNotDb = apiItems.filter(item =>
    !dbActiveItems.some(dbItem => dbItem.itemId === item.itemId)
  );

  console.log(`\n⚠️ Items ACTIVE in DB but NOT in current API (should be deactivated): ${itemsInDbButNotApi.length}`);
  if (itemsInDbButNotApi.length > 0) {
    console.log('\nFirst 5 items that need deactivation:');
    itemsInDbButNotApi.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} (${item.itemId})`);
    });
  }

  console.log(`\n✅ Items in API but NOT in DB (should be created): ${itemsInApiButNotDb.length}`);
  if (itemsInApiButNotDb.length > 0) {
    console.log('\nFirst 5 new items to add:');
    itemsInApiButNotDb.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} (${item.itemId})`);
    });
  }

  // 7. Check today's catalog
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCatalog = await prisma.dailyCatalog.findUnique({
    where: { date: today },
    include: {
      items: {
        include: { item: true },
      },
    },
  });

  if (todayCatalog) {
    console.log(`\n📅 Today's catalog (${today.toISOString().split('T')[0]}):`);
    console.log(`   Total items: ${todayCatalog.items.length}`);
    console.log(`   Shop closes at: ${todayCatalog.shopClosesAt.toISOString()}`);

    const tinyInTodayCatalog = todayCatalog.items.find(ci => ci.item.itemId === 'EID_TinyTremors');
    if (tinyInTodayCatalog) {
      console.log(`   ⚠️ EID_TinyTremors IS in today's catalog`);
    } else {
      console.log(`   ✅ EID_TinyTremors NOT in today's catalog`);
    }
  } else {
    console.log('\n❌ No catalog found for today');
  }

  await prisma.$disconnect();
}

testCatalogSync().catch(console.error);
