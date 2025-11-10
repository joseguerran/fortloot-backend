import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Prueba diferentes métodos para acceder a la tienda oficial de Fortnite
 */
async function testFortniteShopScraping() {
  console.log('🔍 Probando acceso a la tienda oficial de Fortnite\n');

  const urls = [
    'https://www.fortnite.com/item-shop',
    'https://www.fortnite.com/item-shop?lang=en-US',
    'https://www.epicgames.com/fortnite/en-US/item-shop',
  ];

  // Test 1: Direct HTTP request with different user agents
  console.log('=' .repeat(80));
  console.log('TEST 1: HTTP Request Directo');
  console.log('='.repeat(80));

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'curl/7.68.0',
  ];

  for (const url of urls) {
    console.log(`\n📡 Intentando: ${url}`);

    for (let i = 0; i < userAgents.length; i++) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': userAgents[i],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          timeout: 10000,
          maxRedirects: 5,
        });

        console.log(`   ✅ User-Agent ${i + 1}: Status ${response.status}`);
        console.log(`   📄 Content-Length: ${response.data.length} bytes`);
        console.log(`   📝 Content-Type: ${response.headers['content-type']}`);

        // Check if it's actual HTML or just a redirect/error page
        const isHTML = response.headers['content-type']?.includes('text/html');
        if (isHTML) {
          // Parse HTML to see what we got
          const $ = cheerio.load(response.data);
          const title = $('title').text();
          const bodyText = $('body').text().substring(0, 200);

          console.log(`   📋 Title: ${title}`);
          console.log(`   📄 Body preview: ${bodyText.replace(/\s+/g, ' ').trim()}`);

          // Check for common Fortnite shop elements
          const hasShopData = response.data.includes('item-shop') ||
                            response.data.includes('Item Shop') ||
                            response.data.includes('vbucks') ||
                            response.data.includes('V-Bucks');

          if (hasShopData) {
            console.log(`   ✅ Parece contener datos de la tienda!`);

            // Try to find JSON data embedded in the page
            const scriptTags = $('script[type="application/json"]').toArray();
            const scriptWithData = $('script').toArray().filter(script => {
              const content = $(script).html() || '';
              return content.includes('itemShop') || content.includes('catalog');
            });

            console.log(`   📊 Script tags with JSON: ${scriptTags.length}`);
            console.log(`   📊 Script tags with shop data: ${scriptWithData.length}`);

            if (scriptWithData.length > 0) {
              console.log(`\n   🎯 Encontré ${scriptWithData.length} script(s) con posibles datos!`);
              // Show a preview of the first one
              const firstScript = $(scriptWithData[0]).html() || '';
              console.log(`   Preview: ${firstScript.substring(0, 500)}...`);
            }
          } else {
            console.log(`   ⚠️ No parece contener datos de la tienda`);
          }
        }

        // Only try first working user agent
        break;
      } catch (error: any) {
        console.log(`   ❌ User-Agent ${i + 1}: ${error.response?.status || error.code || error.message}`);
      }
    }
  }

  // Test 2: Check if there's an API endpoint we can call
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: API Endpoints Públicos');
  console.log('='.repeat(80));

  const apiEndpoints = [
    'https://www.fortnite.com/api/storefront/v2/catalog',
    'https://www.fortnite.com/api/shop',
    'https://fortnite-api.com/v2/shop/br',
    'https://fortnite-api.com/v2/shop',
    'https://fnbr.co/api/shop',
  ];

  for (const endpoint of apiEndpoints) {
    console.log(`\n📡 Intentando: ${endpoint}`);
    try {
      const response = await axios.get(endpoint, {
        headers: {
          'User-Agent': userAgents[0],
        },
        timeout: 10000,
      });

      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   📄 Response size: ${JSON.stringify(response.data).length} bytes`);

      // Check if it's JSON
      if (typeof response.data === 'object') {
        const keys = Object.keys(response.data);
        console.log(`   📊 JSON keys: ${keys.join(', ')}`);

        // Check if it has shop data
        if (response.data.data || response.data.shop || response.data.items) {
          console.log(`   ✅ ¡Tiene datos de tienda!`);
          const shopData = response.data.data || response.data.shop || response.data.items;
          if (Array.isArray(shopData)) {
            console.log(`   📦 ${shopData.length} items en la tienda`);
            if (shopData.length > 0) {
              console.log(`   📋 Sample item keys: ${Object.keys(shopData[0]).join(', ')}`);
            }
          }
        }
      }
    } catch (error: any) {
      console.log(`   ❌ ${error.response?.status || error.code || error.message}`);
    }
  }

  // Test 3: Alternative Fortnite APIs
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: APIs Alternativas de Fortnite');
  console.log('='.repeat(80));

  const alternativeAPIs = [
    {
      name: 'Fortnite-API.com (Sin API Key)',
      url: 'https://fortnite-api.com/v2/shop/br',
      requiresKey: false,
    },
    {
      name: 'FNBR.co',
      url: 'https://fnbr.co/api/shop',
      requiresKey: false,
    },
  ];

  for (const api of alternativeAPIs) {
    console.log(`\n🔌 Probando: ${api.name}`);
    console.log(`   URL: ${api.url}`);

    try {
      const response = await axios.get(api.url, {
        headers: {
          'User-Agent': userAgents[0],
        },
        timeout: 10000,
      });

      console.log(`   ✅ Status: ${response.status}`);

      if (typeof response.data === 'object') {
        console.log(`   📊 Estructura de respuesta:`);
        const keys = Object.keys(response.data);
        keys.forEach(key => {
          const value = response.data[key];
          if (Array.isArray(value)) {
            console.log(`      - ${key}: Array[${value.length}]`);
            if (value.length > 0) {
              console.log(`        Ejemplo: ${JSON.stringify(value[0]).substring(0, 100)}...`);
            }
          } else if (typeof value === 'object' && value !== null) {
            console.log(`      - ${key}: Object{${Object.keys(value).join(', ')}}`);
          } else {
            console.log(`      - ${key}: ${value}`);
          }
        });

        // Check for items
        const shopItems = response.data.data?.featured || response.data.data?.daily ||
                         response.data.shop || response.data.items || [];

        if (Array.isArray(shopItems) && shopItems.length > 0) {
          console.log(`\n   ✅ ¡Encontré ${shopItems.length} items!`);
          const firstItem = shopItems[0];
          console.log(`\n   📦 Ejemplo de item:`);
          console.log(JSON.stringify(firstItem, null, 2).substring(0, 1000));
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.response?.status || error.code || error.message}`);
      if (error.response?.data) {
        console.log(`   📄 Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN Y RECOMENDACIONES');
  console.log('='.repeat(80));

  console.log(`\n📊 Opciones Descubiertas:\n`);
  console.log(`1. Epic Games API Oficial (vía bot) - ✅ FUNCIONA`);
  console.log(`   - Requiere autenticación del bot`);
  console.log(`   - Datos 100% actuales`);
  console.log(`   - Sin rarity ni imágenes públicas\n`);

  console.log(`2. FortniteAPI.io - ⚠️ FUNCIONA PERO DESACTUALIZADO`);
  console.log(`   - Muestra items de últimas 24-48h`);
  console.log(`   - Incluye rarity e imágenes`);
  console.log(`   - No cumple contrato de rotación\n`);

  console.log(`3. Fortnite-API.com - 🔍 A VERIFICAR`);
  console.log(`   - API pública alternativa`);
  console.log(`   - Verificar si datos están actualizados`);
  console.log(`   - Verificar contrato de rotación\n`);

  console.log(`4. Scraping Página Oficial - ❌ PROBABLEMENTE NO VIABLE`);
  console.log(`   - Página renderizada con JavaScript (React/Next.js)`);
  console.log(`   - Requeriría browser automation (Puppeteer/Playwright)`);
  console.log(`   - Más complejo y frágil\n`);
}

testFortniteShopScraping().catch(console.error);
