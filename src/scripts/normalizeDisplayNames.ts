/**
 * Script para normalizar displayName en todas las tablas
 * - Friendships: normalizar a lowercase
 * - Customers: verificar que estén normalizados
 */
import { prisma } from '../database/client';

async function normalizeDisplayNames() {
  console.log('='.repeat(60));
  console.log('NORMALIZACIÓN DE DISPLAYNAMES');
  console.log('='.repeat(60));
  console.log();

  let totalUpdated = 0;

  // 1. Normalizar Friendships
  console.log('📝 Normalizando Friendships...');
  const friendships = await prisma.friendship.findMany({
    where: {
      NOT: {
        displayName: {
          equals: prisma.friendship.fields.displayName,
        }
      }
    }
  });

  // Get all friendships and filter in memory
  const allFriendships = await prisma.friendship.findMany();
  const friendshipsToUpdate = allFriendships.filter(
    f => f.displayName && f.displayName !== f.displayName.toLowerCase()
  );

  for (const friendship of friendshipsToUpdate) {
    const normalizedName = friendship.displayName.toLowerCase();
    await prisma.friendship.update({
      where: { id: friendship.id },
      data: { displayName: normalizedName }
    });
    console.log(`  ✓ ${friendship.displayName} → ${normalizedName}`);
    totalUpdated++;
  }

  if (friendshipsToUpdate.length === 0) {
    console.log('  ✓ Todos los displayNames ya están normalizados');
  }

  console.log();

  // 2. Verificar Customers
  console.log('📝 Verificando Customers...');
  const allCustomers = await prisma.customer.findMany();
  const customersToUpdate = allCustomers.filter(
    c => c.displayName && c.displayName !== c.displayName.toLowerCase()
  );

  for (const customer of customersToUpdate) {
    const normalizedName = customer.displayName!.toLowerCase();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { displayName: normalizedName }
    });
    console.log(`  ✓ ${customer.displayName} → ${normalizedName}`);
    totalUpdated++;
  }

  if (customersToUpdate.length === 0) {
    console.log('  ✓ Todos los displayNames ya están normalizados');
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`✅ Normalización completada. Total actualizados: ${totalUpdated}`);
  console.log('='.repeat(60));
}

normalizeDisplayNames()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
