import { botManager } from '../src/bots/BotManager';
import { log } from '../src/utils/logger';

async function checkItemCatalogAvailability() {
  console.log('🔍 Checking if EID_TinyTremors is in Epic Games current catalog...\n');

  // Get an active bot
  const activeBots = botManager.getActiveBots();

  if (activeBots.length === 0) {
    console.log('❌ No active bots available. Please start a bot first.');
    process.exit(1);
  }

  const bot = activeBots[0];
  const botStatus = bot.getStatus();
  console.log(`✅ Using bot: ${botStatus.displayName}\n`);

  try {
    // Query the bot's catalog
    console.log('📡 Querying Epic Games catalog from bot...');
    const catalog = await bot.queryCatalog(true); // Force refresh

    console.log(`✅ Catalog loaded: ${catalog.length} total items\n`);

    // Search for EID_TinyTremors
    console.log('🔎 Searching for "EID_TinyTremors"...');
    const exactMatch = catalog.find(item => item.itemId === 'EID_TinyTremors');

    if (exactMatch) {
      console.log('\n✅ FOUND EXACT MATCH:');
      console.log(`   offerId: ${exactMatch.offerId}`);
      console.log(`   itemId: ${exactMatch.itemId}`);
      console.log(`   name: ${exactMatch.name}`);
      console.log(`   type: ${exactMatch.type}`);
      console.log(`   price: ${exactMatch.price} V-Bucks`);
      console.log(`   giftable: ${exactMatch.giftable}`);
    } else {
      console.log('\n❌ NOT FOUND in current catalog');

      // Search for similar items
      console.log('\n🔎 Searching for similar items with "Tiny" in name...');
      const similarItems = catalog.filter(item =>
        item.name.toLowerCase().includes('tiny') ||
        item.itemId.toLowerCase().includes('tiny')
      );

      if (similarItems.length > 0) {
        console.log(`\n✅ Found ${similarItems.length} similar item(s):`);
        similarItems.forEach((item, i) => {
          console.log(`\n${i + 1}. ${item.name}`);
          console.log(`   itemId: ${item.itemId}`);
          console.log(`   offerId: ${item.offerId}`);
          console.log(`   type: ${item.type}`);
          console.log(`   price: ${item.price} V-Bucks`);
          console.log(`   giftable: ${item.giftable}`);
        });
      } else {
        console.log('❌ No similar items found');
      }

      // Show some EMOTE items from current catalog
      console.log('\n📊 Sample of current EMOTE items in catalog:');
      const emotes = catalog.filter(item => item.type === 'AthenaDance').slice(0, 5);
      emotes.forEach((item, i) => {
        console.log(`\n${i + 1}. ${item.name}`);
        console.log(`   itemId: ${item.itemId}`);
        console.log(`   price: ${item.price} V-Bucks`);
        console.log(`   giftable: ${item.giftable}`);
      });
    }

    // Now test the searchCatalogItem method with EID_TinyTremors
    console.log('\n\n🧪 Testing bot.searchCatalogItem("EID_TinyTremors")...');
    const searchResult = await bot.searchCatalogItem('EID_TinyTremors', false);

    if (searchResult.found) {
      console.log('\n✅ Search found a match:');
      console.log(`   exactMatch: ${searchResult.exactMatch}`);
      console.log(`   item.name: ${searchResult.item?.name}`);
      console.log(`   item.itemId: ${searchResult.item?.itemId}`);
      console.log(`   item.offerId: ${searchResult.item?.offerId}`);
    } else {
      console.log('\n❌ Search did not find any match');
      if (searchResult.suggestions && searchResult.suggestions.length > 0) {
        console.log(`\n💡 Suggestions (${searchResult.suggestions.length}):`);
        searchResult.suggestions.forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.name} (${item.itemId})`);
        });
      }
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkItemCatalogAvailability().catch(console.error);
