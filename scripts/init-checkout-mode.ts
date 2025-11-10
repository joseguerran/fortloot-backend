/**
 * Script to initialize checkout_mode configuration in the database
 * Run with: npx tsx scripts/init-checkout-mode.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Initializing checkout_mode configuration...');

  try {
    // Check if checkout_mode already exists
    const existing = await prisma.config.findUnique({
      where: { key: 'checkout_mode' }
    });

    if (existing) {
      console.log(`✅ checkout_mode already exists with value: ${existing.value}`);
      console.log('   No changes made.');
      return;
    }

    // Create checkout_mode configuration with default value 'whatsapp'
    const config = await prisma.config.create({
      data: {
        key: 'checkout_mode',
        value: 'whatsapp',
        description: 'Checkout mode: whatsapp (manual via WhatsApp), wizard (new checkout flow), or bot-wizard (future automated bot checkout)'
      }
    });

    console.log('✅ Successfully created checkout_mode configuration:');
    console.log(`   Key: ${config.key}`);
    console.log(`   Value: ${config.value}`);
    console.log(`   Description: ${config.description}`);
    console.log('\n💡 You can change this value from the backoffice settings page.');

  } catch (error) {
    console.error('❌ Error initializing checkout_mode:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
