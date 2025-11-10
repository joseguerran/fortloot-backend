/**
 * POC: Test Playwright scraping of Fortnite official shop page
 *
 * To run this test:
 * 1. npm install playwright
 * 2. npx playwright install chromium
 * 3. npx ts-node scripts/testPlaywrightScraping.ts
 */

async function testScrapingWithPlaywright() {
  console.log('🔍 POC: Testing Playwright Scraping of Fortnite Item Shop\\n');
  console.log('⚠️ NOTE: Playwright not installed yet.\\n');
  console.log('To install and run this POC:\\n');
  console.log('1. npm install playwright');
  console.log('2. npx playwright install chromium');
  console.log('3. npx ts-node scripts/testPlaywrightScraping.ts\\n');

  console.log('📋 This POC will test:\\n');
  console.log('   1. Can we bypass CloudFlare 403?');
  console.log('   2. Does JavaScript content render?');
  console.log('   3. What HTML structure does the shop have?');
  console.log('   4. Can we extract item data?');
  console.log('   5. How long does scraping take?\\n');

  console.log('Expected result: If successful, we can use Playwright as fallback.\\n');

  // Uncomment below once Playwright is installed:
  /*
  const { chromium } = require('playwright');

  const startTime = Date.now();

  const browser = await chromium.launch({
    headless: true,  // Set to false to see browser
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('📡 Navigating to Fortnite shop...');

    const navigationStart = Date.now();
    await page.goto('https://www.fortnite.com/item-shop?lang=en-US', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    const navigationTime = Date.now() - navigationStart;

    console.log(`✅ Page loaded in ${navigationTime}ms`);

    // Take screenshot for debugging
    await page.screenshot({ path: 'fortnite-shop-poc.png', fullPage: false });
    console.log('📸 Screenshot saved to fortnite-shop-poc.png');

    // Check page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);

    // Get page HTML
    const html = await page.content();
    console.log(`📄 HTML length: ${html.length.toLocaleString()} bytes`);

    // Check if we got blocked
    if (html.includes('403') || html.includes('Access Denied') || html.includes('Cloudflare')) {
      console.log('\\n❌ BLOCKED: Page shows CloudFlare/403 error');
      console.log('   Playwright alone may not be enough.');
      console.log('   Need to try: residential proxies, stealth plugins, or cloud service.');
    } else {
      console.log('\\n✅ NOT BLOCKED: Page loaded successfully!');
    }

    // Wait for content to load (JavaScript rendering)
    console.log('\\n⏳ Waiting 5s for JavaScript to render content...');
    await page.waitForTimeout(5000);

    // Try to find item elements with different selectors
    console.log('\\n🔍 Looking for item elements...\\n');

    const possibleSelectors = [
      '[data-testid="item-card"]',
      '[data-component="ItemCard"]',
      '[class*="ItemCard"]',
      '[class*="item-card"]',
      '[class*="shop-item"]',
      '[class*="ShopItem"]',
      'article',
      '[role="article"]',
      '[class*="product"]',
      '[class*="card"]',
    ];

    const foundSelectors: { selector: string; count: number }[] = [];

    for (const selector of possibleSelectors) {
      try {
        const elements = await page.$$(selector);
        const count = elements.length;

        if (count > 0) {
          console.log(`   ✅ ${selector}: ${count} elements`);
          foundSelectors.push({ selector, count });

          // If we found many, try to extract sample data
          if (count > 5) {
            console.log(`\\n   📦 Trying to extract data from ${selector}...`);

            const sampleData = await page.$$eval(selector, (elements: any[]) => {
              return elements.slice(0, 3).map((el: any) => ({
                text: el.textContent?.trim().substring(0, 100),
                classes: el.className,
                html: el.innerHTML.substring(0, 200)
              }));
            });

            console.log('   Sample elements:');
            sampleData.forEach((item: any, i: number) => {
              console.log(`\\n   Element ${i + 1}:`);
              console.log(`      Text: ${item.text}`);
              console.log(`      Classes: ${item.classes}`);
            });
          }
        } else {
          console.log(`   ❌ ${selector}: 0 elements`);
        }
      } catch (error) {
        // Selector might be invalid, skip
      }
    }

    if (foundSelectors.length === 0) {
      console.log('\\n⚠️ No item elements found with common selectors.');
      console.log('   Need to inspect page manually to find correct selectors.');
    }

    // Look for JSON data embedded in page
    console.log('\\n\\n🔍 Looking for JSON data in page...');

    const jsonScripts = await page.$$eval('script[type="application/json"]', (scripts: any[]) => {
      return scripts.map((s: any) => {
        const content = s.textContent || '';
        return {
          id: s.id,
          length: content.length,
          preview: content.substring(0, 200)
        };
      });
    });

    if (jsonScripts.length > 0) {
      console.log(`\\n✅ Found ${jsonScripts.length} JSON script tags`);
      jsonScripts.forEach((script: any, i: number) => {
        console.log(`\\n   Script ${i + 1}:`);
        console.log(`      ID: ${script.id || '(no id)'}`);
        console.log(`      Length: ${script.length} bytes`);
        console.log(`      Preview: ${script.preview}...`);
      });
    } else {
      console.log('\\n❌ No JSON script tags found');
    }

    // Check for Next.js data
    const nextData = await page.evaluate(() => {
      // @ts-ignore
      return typeof window.__NEXT_DATA__ !== 'undefined' ?
        JSON.stringify(window.__NEXT_DATA__).substring(0, 500) : null;
    });

    if (nextData) {
      console.log('\\n✅ Found Next.js data (__NEXT_DATA__)');
      console.log(`   Preview: ${nextData}...`);
    }

    // Intercept network requests to find API calls
    console.log('\\n\\n🔍 Checking network activity...');
    console.log('   (This requires running test again with request interception)');

    const totalTime = Date.now() - startTime;

    console.log('\\n\\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`\\n⏱️ Total scraping time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`📄 Page HTML size: ${html.length.toLocaleString()} bytes`);
    console.log(`🔍 Item selectors found: ${foundSelectors.length}`);
    console.log(`📊 JSON scripts found: ${jsonScripts.length}`);

    if (html.includes('403') || html.includes('Access Denied')) {
      console.log('\\n❌ VERDICT: BLOCKED by CloudFlare');
      console.log('   Recommendation: Use ScrapingBee or similar service with proxy rotation');
    } else if (foundSelectors.length === 0 && jsonScripts.length === 0) {
      console.log('\\n⚠️ VERDICT: NOT BLOCKED but content structure unknown');
      console.log('   Recommendation: Manual inspection needed to find correct selectors');
    } else {
      console.log('\\n✅ VERDICT: SCRAPING VIABLE with Playwright!');
      console.log('   Next steps:');
      console.log('   1. Refine selectors to extract item data');
      console.log('   2. Map data to CatalogItem model');
      console.log('   3. Implement in FortniteScraperService');
    }

  } catch (error: any) {
    console.error('\\n❌ Error:', error.message);
    console.log('\\n   This might indicate:');
    console.log('   - CloudFlare blocking');
    console.log('   - Timeout (page too slow)');
    console.log('   - Network issues');
  } finally {
    await browser.close();
    console.log('\\n✅ Browser closed');
  }
  */
}

testScrapingWithPlaywright().catch(console.error);
