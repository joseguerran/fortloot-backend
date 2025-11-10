import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

/**
 * Script que ejecuta seed solo si la base de datos está vacía
 * Útil para despliegues automáticos en producción
 */
async function main() {
  try {
    // Verificar si ya existe un usuario admin
    const userCount = await prisma.user.count();

    if (userCount === 0) {
      console.log('📦 Database is empty, running seed script...');
      execSync('npm run db:seed', { stdio: 'inherit' });
      console.log('✅ Seed completed');
    } else {
      console.log('✓ Database already initialized, skipping seed');
      console.log(`  Found ${userCount} user(s)`);
    }
  } catch (error) {
    console.error('❌ Error checking database:', error);
    // No fallar el deploy si hay error
    process.exit(0);
  } finally {
    await prisma.$disconnect();
  }
}

main();
