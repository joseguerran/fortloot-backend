/**
 * Script para hacer backup de los datos críticos antes de la migración
 * Exporta en formato JSON para fácil restauración
 */
import { prisma } from '../database/client';
import * as fs from 'fs';
import * as path from 'path';

async function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../../backups');

  // Crear directorio si no existe
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('Starting database backup...');
  console.log(`Backup directory: ${backupDir}`);

  // Exportar cada tabla
  const tables = [
    { name: 'bots', query: () => prisma.bot.findMany() },
    { name: 'customers', query: () => prisma.customer.findMany() },
    { name: 'orders', query: () => prisma.order.findMany() },
    { name: 'orderItems', query: () => prisma.orderItem.findMany() },
    { name: 'friendships', query: () => prisma.friendship.findMany() },
    { name: 'gifts', query: () => prisma.gift.findMany() },
    { name: 'blacklist', query: () => prisma.blacklist.findMany() },
    { name: 'config', query: () => prisma.config.findMany() },
    { name: 'pricingConfig', query: () => prisma.pricingConfig.findMany() },
    { name: 'paymentMethods', query: () => prisma.paymentMethod.findMany() },
    { name: 'catalogItems', query: () => prisma.catalogItem.findMany() },
    { name: 'users', query: () => prisma.user.findMany() },
    { name: 'otpCodes', query: () => prisma.oTPCode.findMany() },
  ];

  const backupData: Record<string, any> = {};
  const summary: Record<string, number> = {};

  for (const table of tables) {
    try {
      console.log(`Backing up ${table.name}...`);
      const data = await table.query();
      backupData[table.name] = data;
      summary[table.name] = data.length;
      console.log(`  → ${data.length} records`);
    } catch (error) {
      console.error(`Error backing up ${table.name}:`, error);
      backupData[table.name] = [];
      summary[table.name] = 0;
    }
  }

  // Guardar backup completo
  const backupFile = path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\nBackup saved to: ${backupFile}`);

  // Guardar resumen
  const summaryFile = path.join(backupDir, `backup_${timestamp}_summary.txt`);
  let summaryText = `Backup Summary - ${new Date().toISOString()}\n`;
  summaryText += '='.repeat(50) + '\n\n';
  for (const [table, count] of Object.entries(summary)) {
    summaryText += `${table}: ${count} records\n`;
  }
  summaryText += '\n' + '='.repeat(50) + '\n';
  summaryText += `Total tables backed up: ${Object.keys(summary).length}\n`;
  fs.writeFileSync(summaryFile, summaryText);

  console.log('\n=== BACKUP SUMMARY ===');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`${table}: ${count} records`);
  }
  console.log('=====================\n');

  return backupFile;
}

// Run the backup
backupData()
  .then((file) => {
    console.log(`\n✅ Backup completed successfully!`);
    console.log(`File: ${file}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  });
