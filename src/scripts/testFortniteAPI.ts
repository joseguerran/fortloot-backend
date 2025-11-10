import { FortniteAPIService } from '../services/FortniteAPIService';

async function testAPI() {
  console.log('🧪 Testing Fortnite API connection...\n');

  // Test connection
  const connected = await FortniteAPIService.testConnection();
  console.log(`Connection test: ${connected ? '✅ SUCCESS' : '❌ FAILED'}\n`);

  if (connected) {
    console.log('📥 Fetching Item Shop...\n');
    try {
      const items = await FortniteAPIService.fetchItemShop();
      console.log(`\n✅ Fetched ${items.length} items from Fortnite API`);

      if (items.length > 0) {
        console.log('\n📦 First 3 items:');
        items.slice(0, 3).forEach((item, i) => {
          console.log(`\n${i + 1}. ${item.name}`);
          console.log(`   ID: ${item.itemId}`);
          console.log(`   Type: ${item.type}`);
          console.log(`   Price: ${item.baseVbucks} V-Bucks`);
          console.log(`   Rarity: ${item.rarity}`);
          console.log(`   Giftable: ${item.giftAllowed}`);
        });
      }
    } catch (error) {
      console.error('\n❌ Error fetching shop:', error);
    }
  }

  process.exit(0);
}

testAPI();
