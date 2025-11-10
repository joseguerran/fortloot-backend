import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

/**
 * Script para limpiar la base de datos manteniendo los bots
 * ⚠️  CUIDADO: Este script elimina TODOS los datos excepto los bots
 */

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('🧹 DATABASE CLEANUP SCRIPT');
  console.log('='.repeat(80));
  console.log('⚠️  WARNING: This will delete ALL data except Bot accounts');
  console.log('='.repeat(80));
  console.log('\nThis script will DELETE:');
  console.log('  • Orders & Order Items');
  console.log('  • Customers & Customer Tiers');
  console.log('  • Catalog Items & Daily Catalogs');
  console.log('  • Payments & Payment Methods');
  console.log('  • Users (except existing ones will be asked)');
  console.log('  • Queue Jobs');
  console.log('  • Notifications');
  console.log('  • Metrics');
  console.log('  • Logs');
  console.log('  • All configuration');
  console.log('\nThis script will KEEP:');
  console.log('  ✓ Bot accounts (name, credentials, status, etc.)');
  console.log('');

  const confirmed = await askConfirmation('Are you absolutely sure you want to proceed?');

  if (!confirmed) {
    console.log('\n❌ Operation cancelled by user');
    process.exit(0);
  }

  console.log('\n🔄 Starting cleanup...\n');

  try {
    // Get bot count before cleanup
    const botCount = await prisma.bot.count();
    console.log(`📦 Found ${botCount} bot(s) to preserve\n`);

    // ============================================================================
    // FASE 1: Eliminar gifts, friendships y órdenes
    // ============================================================================
    console.log('🗑️  Phase 1: Cleaning gifts, friendships and orders...');

    const gifts = await prisma.gift.deleteMany({});
    console.log(`   ✓ Deleted ${gifts.count} gifts`);

    const friendships = await prisma.friendship.deleteMany({});
    console.log(`   ✓ Deleted ${friendships.count} friendships`);

    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`   ✓ Deleted ${orderItems.count} order items`);

    const orders = await prisma.order.deleteMany({});
    console.log(`   ✓ Deleted ${orders.count} orders`);

    // ============================================================================
    // FASE 2: Eliminar métodos de pago
    // ============================================================================
    console.log('\n💳 Phase 2: Cleaning payment methods...');

    const paymentMethods = await prisma.paymentMethod.deleteMany({});
    console.log(`   ✓ Deleted ${paymentMethods.count} payment methods`);

    // ============================================================================
    // FASE 3: Eliminar catálogo
    // ============================================================================
    console.log('\n📦 Phase 3: Cleaning catalog data...');

    const dailyCatalogItems = await prisma.dailyCatalogItem.deleteMany({});
    console.log(`   ✓ Deleted ${dailyCatalogItems.count} daily catalog items`);

    const catalogItems = await prisma.catalogItem.deleteMany({});
    console.log(`   ✓ Deleted ${catalogItems.count} catalog items`);

    const dailyCatalogs = await prisma.dailyCatalog.deleteMany({});
    console.log(`   ✓ Deleted ${dailyCatalogs.count} daily catalogs`);

    // ============================================================================
    // FASE 4: Eliminar clientes y tiers
    // ============================================================================
    console.log('\n👥 Phase 4: Cleaning customer data...');

    const customers = await prisma.customer.deleteMany({});
    console.log(`   ✓ Deleted ${customers.count} customers`);

    // ============================================================================
    // FASE 5: Eliminar métricas y actividades de bots
    // ============================================================================
    console.log('\n📊 Phase 5: Cleaning bot metrics and activities...');

    const botActivities = await prisma.botActivity.deleteMany({});
    console.log(`   ✓ Deleted ${botActivities.count} bot activities`);

    const botMetrics = await prisma.botMetric.deleteMany({});
    console.log(`   ✓ Deleted ${botMetrics.count} bot metrics`);

    // ============================================================================
    // FASE 6: Eliminar pricing configs
    // ============================================================================
    console.log('\n💰 Phase 6: Cleaning pricing configs...');

    const pricingConfigs = await prisma.pricingConfig.deleteMany({});
    console.log(`   ✓ Deleted ${pricingConfigs.count} pricing configs`);

    // ============================================================================
    // FASE 7: Eliminar logs y auditoría
    // ============================================================================
    console.log('\n📝 Phase 7: Cleaning logs...');

    const auditLogs = await prisma.auditLog.deleteMany({});
    console.log(`   ✓ Deleted ${auditLogs.count} audit logs`);

    const analytics = await prisma.analytics.deleteMany({});
    console.log(`   ✓ Deleted ${analytics.count} analytics records`);

    const businessMetrics = await prisma.businessMetric.deleteMany({});
    console.log(`   ✓ Deleted ${businessMetrics.count} business metrics`);

    // ============================================================================
    // FASE 8: Eliminar configuración global
    // ============================================================================
    console.log('\n⚙️  Phase 8: Cleaning global configuration...');

    const configs = await prisma.config.deleteMany({});
    console.log(`   ✓ Deleted ${configs.count} configs`);

    // ============================================================================
    // FASE 9: Eliminar blacklist
    // ============================================================================
    console.log('\n🚫 Phase 9: Cleaning blacklist...');

    const blacklist = await prisma.blacklist.deleteMany({});
    console.log(`   ✓ Deleted ${blacklist.count} blacklist entries`);

    // ============================================================================
    // FASE 10: Preguntar sobre usuarios
    // ============================================================================
    console.log('\n👤 Phase 10: Handling users...');

    const users = await prisma.user.findMany({ select: { email: true, role: true } });
    console.log(`   Found ${users.length} user(s):`);
    users.forEach((u) => console.log(`     - ${u.email} (${u.role})`));

    if (users.length > 0) {
      const deleteUsers = await askConfirmation('\n   Do you want to delete ALL users?');
      if (deleteUsers) {
        const deletedUsers = await prisma.user.deleteMany({});
        console.log(`   ✓ Deleted ${deletedUsers.count} users`);
      } else {
        console.log('   ⊘ Skipped user deletion');
      }
    }

    // ============================================================================
    // VERIFICACIÓN FINAL
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('✅ Cleanup completed successfully!');
    console.log('='.repeat(80));

    const finalBotCount = await prisma.bot.count();
    console.log(`\n✓ Bots preserved: ${finalBotCount}`);

    if (finalBotCount !== botCount) {
      console.log('⚠️  WARNING: Bot count changed! Something went wrong!');
    }

    console.log('\n📊 Final Database State:');
    const stats = {
      users: await prisma.user.count(),
      bots: await prisma.bot.count(),
      orders: await prisma.order.count(),
      customers: await prisma.customer.count(),
      catalogItems: await prisma.catalogItem.count(),
    };

    console.log(`   Users: ${stats.users}`);
    console.log(`   Bots: ${stats.bots}`);
    console.log(`   Orders: ${stats.orders}`);
    console.log(`   Customers: ${stats.customers}`);
    console.log(`   Catalog Items: ${stats.catalogItems}`);

    console.log('\n💡 Next step: Run seed script to initialize with base data');
    console.log('   npm run db:seed\n');
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
