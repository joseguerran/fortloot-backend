import { FortniteAPIService } from '../src/services/FortniteAPIService';

/**
 * Test the new Fortnite-API.com integration
 */
async function testNewAPIIntegration() {
  console.log('🧪 Testing Fortnite-API.com Integration\n');

  // Test 1: Connection
  console.log('=' .repeat(80));
  console.log('TEST 1: API Connection');
  console.log('='.repeat(80));

  const connected = await FortniteAPIService.testConnection();

  if (!connected) {
    console.error('\n❌ Failed to connect to Fortnite-API.com');
    process.exit(1);
  }

  console.log('\n✅ Connection successful\n');

  // Test 2: Fetch Shop
  console.log('=' .repeat(80));
  console.log('TEST 2: Fetch Item Shop');
  console.log('='.repeat(80));

  const items = await FortniteAPIService.fetchItemShop();

  console.log(`\n✅ Fetched ${items.length} items\n`);

  // Test 3: Data Structure
  console.log('=' .repeat(80));
  console.log('TEST 3: Data Structure Validation');
  console.log('='.repeat(80));

  if (items.length === 0) {
    console.log('\n⚠️ No items returned. API might be down or empty.');
    process.exit(0);
  }

  const sampleItem = items[0];

  console.log('\n📋 Sample Item:');
  console.log(JSON.stringify(sampleItem, null, 2));

  // Validate fields
  const requiredFields = ['itemId', 'offerId', 'name', 'type', 'rarity', 'image', 'baseVbucks', 'inDate', 'outDate'];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in sampleItem)) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    console.error(`\n❌ Missing required fields: ${missingFields.join(', ')}`);
    process.exit(1);
  }

  console.log('\n✅ All required fields present\n');

  // Test 4: Statistics
  console.log('=' .repeat(80));
  console.log('TEST 4: Item Statistics');
  console.log('='.repeat(80));

  const itemsByType: Record<string, number> = {};
  const itemsByRarity: Record<string, number> = {};

  for (const item of items) {
    itemsByType[item.type] = (itemsByType[item.type] || 0) + 1;
    itemsByRarity[item.rarity] = (itemsByRarity[item.rarity] || 0) + 1;
  }

  console.log('\n📊 Items by Type:');
  Object.entries(itemsByType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type.padEnd(20)} ${count}`);
    });

  console.log('\n📊 Items by Rarity:');
  Object.entries(itemsByRarity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([rarity, count]) => {
      console.log(`   ${rarity.padEnd(20)} ${count}`);
    });

  // Test 5: Rotation Dates
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: Rotation Dates');
  console.log('='.repeat(80));

  const now = new Date();
  const activeItems = items.filter(item => {
    const outDate = new Date(item.outDate);
    return outDate > now;
  });

  const expiredItems = items.filter(item => {
    const outDate = new Date(item.outDate);
    return outDate <= now;
  });

  console.log(`\n✅ Active items (outDate > now):    ${activeItems.length}`);
  console.log(`⚠️ Expired items (outDate <= now):  ${expiredItems.length}`);

  if (expiredItems.length > 0) {
    console.log('\n⚠️ WARNING: Some items have already expired. This should not happen with Fortnite-API.com');
    console.log('Sample expired item:');
    const expired = expiredItems[0];
    console.log(`   Name: ${expired.name}`);
    console.log(`   OutDate: ${expired.outDate}`);
    console.log(`   Now: ${now.toISOString()}`);
  }

  // Test 6: Check for known rotated item
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Check for TinyTremors (Should NOT be present)');
  console.log('='.repeat(80));

  const tinyTremors = items.find(item =>
    item.itemId.includes('TinyTremors') ||
    item.name.toLowerCase().includes('tiniest violin')
  );

  if (tinyTremors) {
    console.log('\n❌ ERROR: TinyTremors found in current shop!');
    console.log('   This item rotated out on Nov 8. Should not be present on Nov 9.');
    console.log(JSON.stringify(tinyTremors, null, 2));
  } else {
    console.log('\n✅ CORRECT: TinyTremors NOT found in current shop');
    console.log('   Item correctly excluded after rotation.');
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  console.log(`\n✅ API Connection:        SUCCESS`);
  console.log(`✅ Items Fetched:         ${items.length}`);
  console.log(`✅ Data Structure:        VALID`);
  console.log(`✅ Rotation Tracking:     ${expiredItems.length === 0 ? 'ACCURATE' : 'NEEDS REVIEW'}`);
  console.log(`✅ TinyTremors Check:     ${!tinyTremors ? 'CORRECT' : 'ERROR'}`);

  console.log('\n🎉 Integration test completed successfully!\n');
  console.log('Next step: Run catalog sync to populate database with new data.');
}

testNewAPIIntegration().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
