import { botManager } from '../src/bots/BotManager';
import { prisma } from '../src/database/client';

/**
 * Verifica que el bot puede obtener todos los datos necesarios
 * para mostrar items en el catálogo y la tienda
 */
async function verifyBotCatalogData() {
  console.log('🔍 Verificando datos del catálogo del bot vs requisitos del sistema\n');

  // Start bot if needed
  const activeBots = botManager.getActiveBots();
  let bot;

  if (activeBots.length === 0) {
    console.log('⚠️ Iniciando bot...');
    const bots = await prisma.bot.findMany({
      where: { isActive: true },
      take: 1,
    });

    if (bots.length === 0) {
      console.log('❌ No bots configurados');
      process.exit(1);
    }

    await botManager.loginBot(bots[0].id);
    await new Promise(resolve => setTimeout(resolve, 3000));
    bot = botManager.getActiveBots()[0];
  } else {
    bot = activeBots[0];
  }

  console.log(`✅ Bot: ${bot.getStatus().displayName}\n`);

  // Get catalog from Epic Games API
  console.log('📡 Consultando catálogo de Epic Games...');
  const catalog = await bot.queryCatalog(true);
  console.log(`✅ ${catalog.length} items en el catálogo\n`);

  // Analyze data structure
  console.log('📊 Analizando estructura de datos...\n');

  // Take a sample of different item types
  const samples = {
    outfit: catalog.find(i => i.type === 'AthenaCharacter'),
    pickaxe: catalog.find(i => i.type === 'AthenaPickaxe'),
    emote: catalog.find(i => i.type === 'AthenaDance'),
    glider: catalog.find(i => i.type === 'AthenaGlider'),
    backpack: catalog.find(i => i.type === 'AthenaBackpack'),
    wrap: catalog.find(i => i.type === 'AthenaItemWrap'),
  };

  console.log('='.repeat(80));
  console.log('DATOS DISPONIBLES POR TIPO DE ITEM');
  console.log('='.repeat(80));

  for (const [typeName, item] of Object.entries(samples)) {
    if (!item) {
      console.log(`\n❌ ${typeName.toUpperCase()}: No encontrado en catálogo`);
      continue;
    }

    console.log(`\n✅ ${typeName.toUpperCase()}: ${item.name}`);
    console.log('-'.repeat(80));
    console.log(`   offerId:          ${item.offerId}`);
    console.log(`   itemId:           ${item.itemId}`);
    console.log(`   name:             ${item.name}`);
    console.log(`   description:      ${item.description || '(vacío)'}`);
    console.log(`   type:             ${item.type}`);
    console.log(`   price:            ${item.price} V-Bucks`);
    console.log(`   currencyType:     ${item.currencyType}`);
    console.log(`   giftable:         ${item.giftable}`);
    console.log(`   displayAssetPath: ${item.displayAssetPath || '(no disponible)'}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('COMPARACIÓN CON REQUISITOS DEL SISTEMA');
  console.log('='.repeat(80));

  // Check what our CatalogItem model needs
  const requiredFields = [
    { field: 'itemId', epicField: 'itemId', available: true },
    { field: 'offerId', epicField: 'offerId', available: true },
    { field: 'name', epicField: 'name', available: true },
    { field: 'description', epicField: 'description', available: true },
    { field: 'type (ProductType)', epicField: 'type', available: true, note: 'Necesita mapeo' },
    { field: 'rarity', epicField: 'N/A', available: false, note: 'NO disponible en Epic API' },
    { field: 'image', epicField: 'displayAssetPath', available: true, note: 'Ruta, no URL completa' },
    { field: 'baseVbucks', epicField: 'price', available: true },
  ];

  console.log('\n📋 Campos requeridos por CatalogItem:\n');

  requiredFields.forEach(({ field, epicField, available, note }) => {
    const status = available ? '✅' : '❌';
    const noteStr = note ? ` (${note})` : '';
    console.log(`${status} ${field.padEnd(25)} → Epic: ${epicField}${noteStr}`);
  });

  // Check image URLs
  console.log('\n' + '='.repeat(80));
  console.log('ANÁLISIS DE IMÁGENES');
  console.log('='.repeat(80));

  const itemsWithImages = catalog.filter(i => i.displayAssetPath);
  const itemsWithoutImages = catalog.filter(i => !i.displayAssetPath);

  console.log(`\n✅ Items con displayAssetPath: ${itemsWithImages.length}`);
  console.log(`❌ Items sin displayAssetPath:  ${itemsWithoutImages.length}`);

  if (itemsWithImages.length > 0) {
    console.log(`\nEjemplo de displayAssetPath:`);
    console.log(`   ${itemsWithImages[0].displayAssetPath}`);
    console.log(`\nNOTA: Epic API NO proporciona URLs completas de imágenes.`);
    console.log(`      Solo proporciona rutas internas de Epic Games.`);
    console.log(`      Necesitaríamos un servicio adicional para convertir esto a URLs públicas.`);
  }

  // Check rarity
  console.log('\n' + '='.repeat(80));
  console.log('ANÁLISIS DE RARITY (RAREZA)');
  console.log('='.repeat(80));

  console.log(`\n❌ Epic Games API NO incluye información de rarity en el catálogo.`);
  console.log(`   Posibles soluciones:`);
  console.log(`   1. Usar FortniteAPI.io solo para obtener rarities (híbrido)`);
  console.log(`   2. Inferir rarity del precio (aproximado):`);
  console.log(`      - 200-500 V-Bucks    → Uncommon/Common`);
  console.log(`      - 500-800 V-Bucks    → Rare`);
  console.log(`      - 800-1200 V-Bucks   → Epic`);
  console.log(`      - 1200-1500 V-Bucks  → Legendary`);
  console.log(`      - 1500+ V-Bucks      → Legendary/Exotic`);
  console.log(`   3. Hacer rarity opcional en nuestro sistema`);

  // Price distribution
  console.log('\n' + '='.repeat(80));
  console.log('DISTRIBUCIÓN DE PRECIOS');
  console.log('='.repeat(80));

  const priceRanges = {
    '0-200': 0,
    '200-500': 0,
    '500-800': 0,
    '800-1200': 0,
    '1200-1500': 0,
    '1500-2000': 0,
    '2000+': 0,
  };

  catalog.forEach(item => {
    if (item.price === 0) priceRanges['0-200']++;
    else if (item.price <= 500) priceRanges['200-500']++;
    else if (item.price <= 800) priceRanges['500-800']++;
    else if (item.price <= 1200) priceRanges['800-1200']++;
    else if (item.price <= 1500) priceRanges['1200-1500']++;
    else if (item.price <= 2000) priceRanges['1500-2000']++;
    else priceRanges['2000+']++;
  });

  console.log('\n📊 Distribución por rango de precio:\n');
  Object.entries(priceRanges).forEach(([range, count]) => {
    const bar = '█'.repeat(Math.floor(count / 5));
    console.log(`   ${range.padEnd(15)} ${count.toString().padStart(3)} ${bar}`);
  });

  // Giftable analysis
  console.log('\n' + '='.repeat(80));
  console.log('ANÁLISIS DE GIFTABLE');
  console.log('='.repeat(80));

  const giftableItems = catalog.filter(i => i.giftable);
  const notGiftableItems = catalog.filter(i => !i.giftable);

  console.log(`\n✅ Items giftable:     ${giftableItems.length} (${Math.round(giftableItems.length / catalog.length * 100)}%)`);
  console.log(`❌ Items NO giftable:  ${notGiftableItems.length} (${Math.round(notGiftableItems.length / catalog.length * 100)}%)`);

  console.log(`\nNOTA: Solo debemos mostrar items con giftable=true en la tienda.`);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN Y RECOMENDACIONES');
  console.log('='.repeat(80));

  console.log(`\n✅ DATOS DISPONIBLES EN EPIC API:`);
  console.log(`   - itemId (identificador único)`);
  console.log(`   - offerId (para enviar regalos)`);
  console.log(`   - name (nombre del item)`);
  console.log(`   - description (descripción)`);
  console.log(`   - type (tipo de item)`);
  console.log(`   - price (precio en V-Bucks)`);
  console.log(`   - giftable (si se puede regalar)`);
  console.log(`   - displayAssetPath (ruta interna de imagen)`);

  console.log(`\n❌ DATOS NO DISPONIBLES EN EPIC API:`);
  console.log(`   - rarity (rareza del item)`);
  console.log(`   - image URL pública (solo ruta interna)`);

  console.log(`\n💡 SOLUCIONES PROPUESTAS:`);
  console.log(`\n   Opción 1: HÍBRIDO (RECOMENDADO)`);
  console.log(`   - Usar Epic API como fuente principal (items actuales)`);
  console.log(`   - Usar FortniteAPI.io para enriquecer con rarity e imágenes`);
  console.log(`   - Match por itemId entre ambas APIs`);

  console.log(`\n   Opción 2: SOLO EPIC API`);
  console.log(`   - Inferir rarity del precio`);
  console.log(`   - Usar placeholder para imágenes o displayAssetPath`);
  console.log(`   - Sistema más simple pero menos visual`);

  console.log(`\n   Opción 3: USAR FORTNITE-API.COM (OTRA API)`);
  console.log(`   - API pública alternativa a FortniteAPI.io`);
  console.log(`   - Verificar si tiene mejor contrato de rotación`);

  console.log('\n' + '='.repeat(80));
}

verifyBotCatalogData().catch(console.error);
