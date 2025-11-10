import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createStoreUser() {
  try {
    const apiKey = 'forloot-api-secret-key-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';

    // Check if user with this API key already exists
    const existingUser = await prisma.user.findUnique({
      where: { apiKey },
    });

    if (existingUser) {
      console.log('✅ Store user already exists:');
      console.log('   ID:', existingUser.id);
      console.log('   Username:', existingUser.username);
      console.log('   Role:', existingUser.role);
      console.log('   Is Active:', existingUser.isActive);
      console.log('   API Key:', existingUser.apiKey);
      return;
    }

    // Create password hash (not used for API key auth, but required by schema)
    const passwordHash = await bcrypt.hash('store-internal-password-not-used', 10);

    // Create store user
    const user = await prisma.user.create({
      data: {
        username: 'store-client',
        email: 'store@fortloot.internal',
        passwordHash,
        apiKey,
        role: 'VIEWER', // Store only needs to create orders, minimal permissions
        isActive: true,
      },
    });

    console.log('✅ Store user created successfully:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   API Key:', user.apiKey);
    console.log('\n📝 This user will be used by the store to authenticate API requests.');
    console.log('   Make sure store .env.local has:');
    console.log(`   NEXT_PUBLIC_API_SECRET=${apiKey}`);

  } catch (error) {
    console.error('❌ Error creating store user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createStoreUser();
