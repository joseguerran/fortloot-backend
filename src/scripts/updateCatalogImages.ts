import { prisma } from '../database/client';

async function updateCatalogImages() {
  try {
    console.log('🖼️  Actualizando imágenes del catálogo...\n');

    // Inline SVG data URIs - no fallarán y no titilan
    const vbucksImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%234F46E5"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="48" fill="white" font-family="Arial"%3EV-Bucks%3C/text%3E%3C/svg%3E';

    // V-Bucks images - usando SVG inline
    const vbucksUpdates = [
      {
        name: '1,000 Pavomonedas',
        image: vbucksImage
      },
      {
        name: '2,800 Pavomonedas',
        image: vbucksImage
      },
      {
        name: '5,000 Pavomonedas',
        image: vbucksImage
      },
      {
        name: '13,500 Pavomonedas',
        image: vbucksImage
      }
    ];

    for (const vbuck of vbucksUpdates) {
      await prisma.catalogItem.updateMany({
        where: { name: vbuck.name, type: 'VBUCKS' },
        data: { image: vbuck.image }
      });
      console.log(`✓ Actualizado: ${vbuck.name}`);
    }

    // Crew images - SVG inline azul
    const crewImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%2306B6D4"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="36" fill="white" font-family="Arial"%3EFortnite Crew%3C/text%3E%3C/svg%3E';

    const crewUpdates = [
      {
        name: 'Fortnite Crew - 1 Mes',
        image: crewImage
      },
      {
        name: 'Fortnite Crew - 3 Meses',
        image: crewImage
      }
    ];

    for (const crew of crewUpdates) {
      await prisma.catalogItem.updateMany({
        where: { name: crew.name, type: 'BATTLE_PASS' },
        data: { image: crew.image }
      });
      console.log(`✓ Actualizado: ${crew.name}`);
    }

    // Bundle images - SVGs inline de diferentes colores
    const bundles = await prisma.catalogItem.findMany({
      where: { type: 'BUNDLE', isCustom: true }
    });

    const bundleImages = [
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%238B5CF6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="40" fill="white" font-family="Arial"%3EBundle%3C/text%3E%3C/svg%3E',
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%23F59E0B"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="40" fill="white" font-family="Arial"%3EBundle%3C/text%3E%3C/svg%3E',
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%2310B981"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="40" fill="white" font-family="Arial"%3EBundle%3C/text%3E%3C/svg%3E',
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%23EF4444"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="40" fill="white" font-family="Arial"%3EBundle%3C/text%3E%3C/svg%3E'
    ];

    for (let i = 0; i < bundles.length; i++) {
      await prisma.catalogItem.update({
        where: { id: bundles[i].id },
        data: { image: bundleImages[i] || bundleImages[0] }
      });
      console.log(`✓ Actualizado: ${bundles[i].name}`);
    }

    console.log('\n✅ Todas las imágenes actualizadas correctamente');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

updateCatalogImages();
