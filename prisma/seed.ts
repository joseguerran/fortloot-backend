import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // ============================================================================
  // 1. CREAR USUARIO ADMIN
  // ============================================================================
  console.log('👤 Creating admin user...');

  const adminEmail = 'admin@fortloot.com';
  const adminUsername = 'admin';
  const adminPassword = 'Admin123!'; // Cambiar en producción

  let existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    existingAdmin = await prisma.user.findUnique({
      where: { username: adminUsername },
    });
  }

  let adminUser;
  if (existingAdmin) {
    console.log(`   ✓ Admin user already exists: ${existingAdmin.email}`);
    adminUser = existingAdmin;
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const apiKey = crypto.randomBytes(32).toString('hex');

    adminUser = await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        passwordHash: hashedPassword,
        apiKey,
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log(`   ✓ Admin user created: ${adminEmail}`);
    console.log(`   ⚠️  Password: ${adminPassword} (CHANGE THIS IN PRODUCTION!)`);
  }

  // ============================================================================
  // 2. CREAR CONFIGURACIÓN GLOBAL
  // ============================================================================
  console.log('\n⚙️  Creating global configuration...');

  const configs = [
    { key: 'maintenance_mode', value: 'false', description: 'Sistema en mantenimiento' },
    { key: 'allow_new_orders', value: 'true', description: 'Permitir nuevas órdenes' },
    { key: 'notifications_enabled', value: 'true', description: 'Notificaciones habilitadas' },
    { key: 'max_concurrent_orders', value: '10', description: 'Máximo de órdenes concurrentes' },
  ];

  for (const config of configs) {
    const existing = await prisma.config.findUnique({
      where: { key: config.key },
    });

    if (existing) {
      console.log(`   ✓ Config already exists: ${config.key}`);
    } else {
      await prisma.config.create({ data: config });
      console.log(`   ✓ Created config: ${config.key}`);
    }
  }

  // ============================================================================
  // 3. CREAR MÉTODOS DE PAGO
  // ============================================================================
  console.log('\n💳 Creating payment methods...');

  const paymentMethods = [
    {
      name: 'Transferencia Bancaria',
      slug: 'bank-transfer',
      description: 'Pago mediante transferencia bancaria',
      instructions: 'Por favor realizar transferencia a:\\nBanco: XXX\\nCuenta: XXX\\nTitular: XXX',
      isActive: true,
      displayOrder: 1,
    },
    {
      name: 'PayPal',
      slug: 'paypal',
      description: 'Pago mediante PayPal',
      instructions: 'Enviar pago a: pagos@fortloot.com',
      isActive: true,
      displayOrder: 2,
    },
    {
      name: 'Zelle',
      slug: 'zelle',
      description: 'Pago mediante Zelle',
      instructions: 'Enviar a: pagos@fortloot.com',
      isActive: true,
      displayOrder: 3,
    },
    {
      name: 'Criptomonedas',
      slug: 'cryptomus',
      description: 'Pago con USDT, BTC, ETH y otras criptomonedas',
      instructions: 'Serás redirigido a Cryptomus para completar el pago',
      isActive: true,
      displayOrder: 4,
    },
  ];

  for (const method of paymentMethods) {
    const existing = await prisma.paymentMethod.findUnique({
      where: { slug: method.slug },
    });

    if (existing) {
      console.log(`   ✓ Payment method already exists: ${method.name}`);
    } else {
      await prisma.paymentMethod.create({ data: method });
      console.log(`   ✓ Created payment method: ${method.name}`);
    }
  }

  // ============================================================================
  // 4. CREAR CONFIGURACIÓN DE PRECIOS
  // ============================================================================
  console.log('\n💰 Creating pricing configuration...');

  const existingPricing = await prisma.pricingConfig.findFirst();

  if (existingPricing) {
    console.log('   ✓ Pricing config already exists');
  } else {
    await prisma.pricingConfig.create({
      data: {
        vbucksToUsdRate: 0.008, // 1 V-Buck = $0.008
        defaultProfitMargin: 30, // 30% margen de ganancia
        defaultDiscount: 0,
        taxRate: 0,
        usdToLocalRate: 1.0,
        currencyCode: 'USD',
        currencySymbol: '$',
        applyTaxToFinalPrice: true,
        tierDiscounts: {
          bronze: 0,
          silver: 5,
          gold: 10,
          platinum: 15,
        },
        categoryDiscounts: {},
      },
    });
    console.log('   ✓ Pricing config created');
    console.log('      V-Bucks rate: $0.008');
    console.log('      Profit margin: 30%');
    console.log('      Tier discounts: Bronze 0%, Silver 5%, Gold 10%, Platinum 15%');
  }

  // ============================================================================
  // RESUMEN FINAL
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('✅ Database seeding completed successfully!');
  console.log('='.repeat(80));

  const stats = {
    users: await prisma.user.count(),
    bots: await prisma.bot.count(),
    paymentMethods: await prisma.paymentMethod.count(),
    configs: await prisma.config.count(),
    pricingConfigs: await prisma.pricingConfig.count(),
  };

  console.log('\n📊 Current Database State:');
  console.log(`   Users: ${stats.users}`);
  console.log(`   Bots: ${stats.bots}`);
  console.log(`   Payment Methods: ${stats.paymentMethods}`);
  console.log(`   Configs: ${stats.configs}`);
  console.log(`   Pricing Configs: ${stats.pricingConfigs}`);

  console.log('\n🔐 Admin Credentials:');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Username: ${adminUsername}`);
  console.log(`   Password: ${adminPassword}`);
  console.log('   ⚠️  IMPORTANT: Change the admin password after first login!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
