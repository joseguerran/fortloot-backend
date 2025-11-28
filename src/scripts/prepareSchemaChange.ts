/**
 * Script para preparar el cambio de schema
 * Asegura que todos los customers tengan displayName antes de hacerlo obligatorio
 */
import { prisma } from '../database/client';

async function prepareSchemaChange() {
  console.log('='.repeat(60));
  console.log('PREPARACIÓN PARA CAMBIO DE SCHEMA');
  console.log('='.repeat(60));
  console.log();

  // 1. Asegurar que todos los customers tengan displayName
  console.log('1. Verificando displayName en todos los customers...');

  const customersWithoutDisplayName = await prisma.customer.findMany({
    where: { displayName: null },
  });

  console.log(`   Encontrados ${customersWithoutDisplayName.length} customers sin displayName`);

  for (const customer of customersWithoutDisplayName) {
    // Usar epicAccountId normalizado como displayName
    const displayName = customer.epicAccountId.toLowerCase();

    await prisma.customer.update({
      where: { id: customer.id },
      data: { displayName },
    });

    console.log(`   ✓ Customer ${customer.id}: displayName = ${displayName}`);
  }

  // 2. Verificar unicidad de displayName
  console.log();
  console.log('2. Verificando unicidad de displayName...');

  const customers = await prisma.customer.findMany({
    select: { id: true, displayName: true },
  });

  const displayNameMap = new Map<string, string[]>();
  for (const c of customers) {
    if (c.displayName) {
      const normalized = c.displayName.toLowerCase();
      const existing = displayNameMap.get(normalized) || [];
      existing.push(c.id);
      displayNameMap.set(normalized, existing);
    }
  }

  const duplicates = Array.from(displayNameMap.entries()).filter(([_, ids]) => ids.length > 1);

  if (duplicates.length > 0) {
    console.log('   ⚠️  DUPLICADOS ENCONTRADOS:');
    for (const [name, ids] of duplicates) {
      console.log(`   - "${name}": ${ids.join(', ')}`);
    }
    console.log();
    console.log('   IMPORTANTE: Debes resolver los duplicados antes de continuar.');
    console.log('   La migración NO se puede aplicar con duplicados.');
    return false;
  }

  console.log('   ✓ No hay duplicados');

  // 3. Verificar que todos los displayNames estén normalizados
  console.log();
  console.log('3. Normalizando displayNames a lowercase...');

  const toNormalize = customers.filter(
    c => c.displayName && c.displayName !== c.displayName.toLowerCase()
  );

  for (const c of toNormalize) {
    await prisma.customer.update({
      where: { id: c.id },
      data: { displayName: c.displayName!.toLowerCase() },
    });
    console.log(`   ✓ ${c.displayName} -> ${c.displayName!.toLowerCase()}`);
  }

  if (toNormalize.length === 0) {
    console.log('   ✓ Todos ya normalizados');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('✅ PREPARACIÓN COMPLETADA');
  console.log('   Ahora puedes ejecutar: npx prisma migrate dev');
  console.log('='.repeat(60));

  return true;
}

prepareSchemaChange()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
