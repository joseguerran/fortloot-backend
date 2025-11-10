import { prisma } from '../database/client';

async function getApiKey() {
  try {
    const user = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: {
        username: true,
        email: true,
        apiKey: true,
        role: true,
      },
    });

    if (!user) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }

    console.log('\n🔑 API KEY for Admin Dashboard');
    console.log('═══════════════════════════════════════════');
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`\nAPI Key: ${user.apiKey}`);
    console.log('═══════════════════════════════════════════\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

getApiKey();
