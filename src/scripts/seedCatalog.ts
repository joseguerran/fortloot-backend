/**
 * Script para poblar el catálogo con items fijos (V-Bucks, Crew, Bundles)
 * Ejecutar con: npm run seed:catalog
 */

import { prisma } from '../database/client';
import { ProductType } from '@prisma/client';
import { log } from '../utils/logger';

const VBUCKS_ITEMS = [
  {
    name: '1,000 Pavomonedas',
    description: 'Pack de 1,000 V-Bucks para Fortnite',
    basePriceUsd: 8.49,
    image: '/images/vbucks-1000.png',
    tags: ['vbucks', 'popular'],
  },
  {
    name: '2,800 Pavomonedas',
    description: 'Pack de 2,800 V-Bucks para Fortnite',
    basePriceUsd: 22.99,
    image: '/images/vbucks-2800.png',
    tags: ['vbucks', 'recommended'],
  },
  {
    name: '5,000 Pavomonedas',
    description: 'Pack de 5,000 V-Bucks para Fortnite',
    basePriceUsd: 36.99,
    image: '/images/vbucks-5000.png',
    tags: ['vbucks', 'best-value'],
  },
  {
    name: '13,500 Pavomonedas',
    description: 'Pack de 13,500 V-Bucks para Fortnite - ¡Mejor valor!',
    basePriceUsd: 89.99,
    image: '/images/vbucks-13500.png',
    tags: ['vbucks', 'best-value', 'premium'],
  },
];

const CREW_ITEMS = [
  {
    name: 'Fortnite Crew - 1 Mes',
    description: 'Suscripción mensual de Fortnite Crew: Pase de batalla + 1,000 V-Bucks + Pack exclusivo',
    basePriceUsd: 11.99,
    image: '/images/crew-monthly.png',
    tags: ['crew', 'monthly', 'subscription'],
  },
  {
    name: 'Fortnite Crew - 3 Meses',
    description: 'Suscripción trimestral de Fortnite Crew: Pase de batalla + 3,000 V-Bucks + Packs exclusivos',
    basePriceUsd: 32.99,
    image: '/images/crew-quarterly.png',
    tags: ['crew', 'quarterly', 'subscription', 'best-value'],
  },
] as const;

const BUNDLE_ITEMS = [
  {
    name: 'Lote Legendario',
    description: 'Pack legendario con skin exclusiva, pico, ala delta y mochila',
    basePriceUsd: 39.99,
    image: '/images/bundle-legendary.png',
    tags: ['bundle', 'legendary', 'complete-set'],
    bundleItems: [
      { type: 'OUTFIT', quantity: 1 },
      { type: 'PICKAXE', quantity: 1 },
      { type: 'GLIDER', quantity: 1 },
      { type: 'BACKPACK', quantity: 1 },
    ],
  },
  {
    name: 'Lote Futurista',
    description: 'Pack futurista con skin + accesorios tecnológicos',
    basePriceUsd: 29.99,
    image: '/images/bundle-futuristic.png',
    tags: ['bundle', 'futuristic', 'tech'],
    bundleItems: [
      { type: 'OUTFIT', quantity: 1 },
      { type: 'PICKAXE', quantity: 1 },
      { type: 'BACKPACK', quantity: 1 },
    ],
  },
  {
    name: 'Lote Oscuro',
    description: 'Pack oscuro con skin sombría + accesorios',
    basePriceUsd: 24.99,
    image: '/images/bundle-dark.png',
    tags: ['bundle', 'dark', 'shadow'],
    bundleItems: [
      { type: 'OUTFIT', quantity: 1 },
      { type: 'PICKAXE', quantity: 1 },
    ],
  },
  {
    name: 'Pack Soledad',
    description: 'Pack temático de soledad con skin única + accesorios',
    basePriceUsd: 19.99,
    image: '/images/bundle-soledad.png',
    tags: ['bundle', 'themed'],
    bundleItems: [
      { type: 'OUTFIT', quantity: 1 },
      { type: 'EMOTE', quantity: 1 },
    ],
  },
];

async function seedCatalog() {
  try {
    log.info('🌱 Starting catalog seed...');

    let created = 0;
    let skipped = 0;

    // Create V-Bucks items
    log.info('Creating V-Bucks items...');
    for (const item of VBUCKS_ITEMS) {
      const existing = await prisma.catalogItem.findFirst({
        where: {
          name: item.name,
          isCustom: true,
        },
      });

      if (existing) {
        log.info(`⏭️  Skipping ${item.name} - already exists`);
        skipped++;
        continue;
      }

      await prisma.catalogItem.create({
        data: {
          ...item,
          type: ProductType.VBUCKS,
          isCustom: true,
          isActive: true,
          requiresManualProcess: false,
        },
      });

      log.info(`✅ Created: ${item.name}`);
      created++;
    }

    // Create Crew items
    log.info('Creating Crew items...');
    for (const item of CREW_ITEMS) {
      const existing = await prisma.catalogItem.findFirst({
        where: {
          name: item.name,
          isCustom: true,
        },
      });

      if (existing) {
        log.info(`⏭️  Skipping ${item.name} - already exists`);
        skipped++;
        continue;
      }

      await prisma.catalogItem.create({
        data: {
          name: item.name,
          description: item.description,
          type: ProductType.BATTLE_PASS, // CREW uses BATTLE_PASS type
          basePriceUsd: item.basePriceUsd,
          image: item.image,
          tags: [...item.tags],
          isCustom: true,
          isActive: true,
          requiresManualProcess: false,
        },
      });

      log.info(`✅ Created: ${item.name}`);
      created++;
    }

    // Create Bundle items
    log.info('Creating Bundle items...');
    for (const item of BUNDLE_ITEMS) {
      const existing = await prisma.catalogItem.findFirst({
        where: {
          name: item.name,
          isCustom: true,
        },
      });

      if (existing) {
        log.info(`⏭️  Skipping ${item.name} - already exists`);
        skipped++;
        continue;
      }

      await prisma.catalogItem.create({
        data: {
          name: item.name,
          description: item.description,
          type: ProductType.BUNDLE,
          basePriceUsd: item.basePriceUsd,
          image: item.image,
          tags: item.tags,
          bundleItems: item.bundleItems as any,
          isCustom: true,
          isActive: true,
          requiresManualProcess: true, // Bundles require manual processing
        },
      });

      log.info(`✅ Created: ${item.name}`);
      created++;
    }

    // Add custom items to today's catalog
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dailyCatalog = await prisma.dailyCatalog.findUnique({
      where: { date: today },
    });

    if (!dailyCatalog) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      dailyCatalog = await prisma.dailyCatalog.create({
        data: {
          date: today,
          shopClosesAt: tomorrow,
        },
      });

      log.info('📅 Created daily catalog for today');
    }

    // Link all custom items to today's catalog
    const customItems = await prisma.catalogItem.findMany({
      where: {
        isCustom: true,
        isActive: true,
      },
    });

    let linked = 0;
    for (const item of customItems) {
      const existingLink = await prisma.dailyCatalogItem.findUnique({
        where: {
          catalogId_itemId: {
            catalogId: dailyCatalog.id,
            itemId: item.id,
          },
        },
      });

      if (!existingLink) {
        await prisma.dailyCatalogItem.create({
          data: {
            catalogId: dailyCatalog.id,
            itemId: item.id,
          },
        });
        linked++;
      }
    }

    log.info(`🔗 Linked ${linked} custom items to today's catalog`);

    log.info(`✨ Seed completed: ${created} created, ${skipped} skipped`);
    log.info(`📊 Total custom items in catalog: ${customItems.length}`);

    process.exit(0);
  } catch (error) {
    log.error('❌ Error seeding catalog:', error);
    process.exit(1);
  }
}

// Run seed
seedCatalog();
