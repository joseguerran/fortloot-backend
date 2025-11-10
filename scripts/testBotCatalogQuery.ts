import { botManager } from '../src/bots/BotManager';
import { log } from '../src/utils/logger';

async function testBotCatalogQuery() {
  console.log('🔍 Testing Bot Catalog Query\n');

  // Get an active bot
  const activeBots = botManager.getActiveBots();

  if (activeBots.length === 0) {
    console.log('⚠️ No active bots available. Starting first bot...');

    // Get first bot from database
    const { prisma } = await import('../src/database/client');
    const bots = await prisma.bot.findMany({
      where: { isActive: true },
      take: 1,
    });

    if (bots.length === 0) {
      console.log('❌ No bots configured in database');
      process.exit(1);
    }

    console.log(`🤖 Starting bot: ${bots[0].displayName}`);
    try {
      await botManager.loginBot(bots[0].id);
      console.log('✅ Bot started successfully\n');

      // Wait a bit for bot to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error: any) {
      console.error('❌ Failed to start bot:', error.message);
      process.exit(1);
    }
  }

  const bot = botManager.getActiveBots()[0];
  const botStatus = bot.getStatus();
  console.log(`✅ Using bot: ${botStatus.displayName}\n`);

  try {
    // Query the bot's catalog from Epic Games API
    console.log('📡 Querying Epic Games catalog from bot (force refresh)...');
    const catalog = await bot.queryCatalog(true);

    console.log(`✅ Catalog loaded: ${catalog.length} total items\n`);

    // Search for EID_TinyTremors
    console.log('🔎 Searching for "EID_TinyTremors" in bot catalog...');
    const exactMatch = catalog.find(item => item.itemId === 'EID_TinyTremors');

    if (exactMatch) {
      console.log('\n✅ FOUND EXACT MATCH in Epic catalog:');
      console.log(`   offerId: ${exactMatch.offerId}`);
      console.log(`   itemId: ${exactMatch.itemId}`);
      console.log(`   name: ${exactMatch.name}`);
      console.log(`   type: ${exactMatch.type}`);
      console.log(`   price: ${exactMatch.price} V-Bucks`);
      console.log(`   giftable: ${exactMatch.giftable}`);
    } else {
      console.log('\n❌ NOT FOUND in Epic catalog');
    }

    // Try the searchCatalogItem method (what the bot uses)
    console.log('\n\n🧪 Testing bot.searchCatalogItem("EID_TinyTremors", false)...');
    const searchResult = await bot.searchCatalogItem('EID_TinyTremors', false);

    if (searchResult.found) {
      console.log('\n✅ Search found a match:');
      console.log(`   exactMatch: ${searchResult.exactMatch}`);
      console.log(`   item.name: ${searchResult.item?.name}`);
      console.log(`   item.itemId: ${searchResult.item?.itemId}`);
      console.log(`   item.offerId: ${searchResult.item?.offerId}`);
      console.log(`   item.price: ${searchResult.item?.price} V-Bucks`);
      console.log(`   item.giftable: ${searchResult.item?.giftable}`);

      if (searchResult.suggestions && searchResult.suggestions.length > 0) {
        console.log(`\n💡 Also found ${searchResult.suggestions.length} suggestions`);
      }
    } else {
      console.log('\n❌ Search did not find any match');
      if (searchResult.suggestions && searchResult.suggestions.length > 0) {
        console.log(`\n💡 Suggestions (${searchResult.suggestions.length}):`);
        searchResult.suggestions.forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.name} (${item.itemId})`);
        });
      }
    }

    // Try resolveOfferIdForGift (the actual method used in gift sending)
    console.log('\n\n🎁 Testing bot.resolveOfferIdForGift("EID_TinyTremors")...');
    try {
      const resolved = await bot.resolveOfferIdForGift('EID_TinyTremors');
      console.log('\n✅ Offer ID resolved successfully:');
      console.log(`   offerId: ${resolved.offerId}`);
      console.log(`   itemName: ${resolved.itemName}`);
      console.log(`   price: ${resolved.price} V-Bucks`);
      console.log(`   isGiftable: ${resolved.isGiftable}`);
    } catch (error: any) {
      console.log(`\n❌ Failed to resolve offer ID: ${error.message}`);
    }

    // Show sample of items in catalog
    console.log('\n\n📊 Sample of items in Epic catalog (first 10):');
    catalog.slice(0, 10).forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} (${item.type})`);
      console.log(`   itemId: ${item.itemId}`);
      console.log(`   price: ${item.price} V-Bucks, giftable: ${item.giftable}`);
    });

    // Search for items with "Tiny" in name
    console.log('\n\n🔎 Searching for items with "Tiny" in name...');
    const tinyItems = catalog.filter(item =>
      item.name.toLowerCase().includes('tiny')
    );

    if (tinyItems.length > 0) {
      console.log(`\n✅ Found ${tinyItems.length} item(s) with "Tiny":`);
      tinyItems.forEach((item, i) => {
        console.log(`${i + 1}. ${item.name}`);
        console.log(`   itemId: ${item.itemId}`);
        console.log(`   offerId: ${item.offerId}`);
        console.log(`   price: ${item.price} V-Bucks`);
      });
    } else {
      console.log('❌ No items with "Tiny" found');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testBotCatalogQuery().catch(console.error);
