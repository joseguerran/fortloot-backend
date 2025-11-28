/**
 * Script para limpiar data antes de normalizar el modelo Order
 *
 * IMPORTANTE: Este script:
 * - Desvincula Friendships de Customers (para preservar Friendships)
 * - Elimina: Gift, OrderItem, Order, OTPCode, Customer
 * - NO TOCA: Bot, Friendship (solo desvincula customerId)
 */

import { prisma } from '../src/database/client';

async function cleanData() {
  console.log('🧹 Iniciando limpieza de datos...\n');

  try {
    // Paso 1: Desvincular Friendships de Customers (NO eliminar friendships)
    console.log('1️⃣ Desvinculando Friendships de Customers...');
    const friendshipsUpdated = await prisma.friendship.updateMany({
      where: {
        customerId: { not: null }
      },
      data: {
        customerId: null
      }
    });
    console.log(`   ✅ ${friendshipsUpdated.count} friendships desvinculados\n`);

    // Paso 2: Eliminar Gifts
    console.log('2️⃣ Eliminando Gifts...');
    const giftsDeleted = await prisma.gift.deleteMany({});
    console.log(`   ✅ ${giftsDeleted.count} gifts eliminados\n`);

    // Paso 3: Eliminar OrderItems
    console.log('3️⃣ Eliminando OrderItems...');
    const orderItemsDeleted = await prisma.orderItem.deleteMany({});
    console.log(`   ✅ ${orderItemsDeleted.count} orderItems eliminados\n`);

    // Paso 4: Eliminar Orders
    console.log('4️⃣ Eliminando Orders...');
    const ordersDeleted = await prisma.order.deleteMany({});
    console.log(`   ✅ ${ordersDeleted.count} orders eliminados\n`);

    // Paso 5: Eliminar OTPCodes (también se eliminarían por Cascade con Customer)
    console.log('5️⃣ Eliminando OTPCodes...');
    const otpCodesDeleted = await prisma.oTPCode.deleteMany({});
    console.log(`   ✅ ${otpCodesDeleted.count} OTPCodes eliminados\n`);

    // Paso 6: Eliminar Customers
    console.log('6️⃣ Eliminando Customers...');
    const customersDeleted = await prisma.customer.deleteMany({});
    console.log(`   ✅ ${customersDeleted.count} customers eliminados\n`);

    // Verificación: Mostrar tablas NO tocadas
    console.log('📊 Verificando tablas preservadas:');
    const botsCount = await prisma.bot.count();
    const friendshipsCount = await prisma.friendship.count();
    const configCount = await prisma.config.count();
    const catalogCount = await prisma.catalogItem.count();
    const paymentMethodsCount = await prisma.paymentMethod.count();
    const usersCount = await prisma.user.count();

    console.log(`   Bot: ${botsCount}`);
    console.log(`   Friendship: ${friendshipsCount}`);
    console.log(`   Config: ${configCount}`);
    console.log(`   CatalogItem: ${catalogCount}`);
    console.log(`   PaymentMethod: ${paymentMethodsCount}`);
    console.log(`   User: ${usersCount}`);

    console.log('\n✅ Limpieza completada exitosamente!');
    console.log('   Ahora puedes actualizar el schema.prisma y ejecutar db push.');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanData();
