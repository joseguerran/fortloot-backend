import { PrismaClient } from '@prisma/client';
import { hashPassword, generateApiKey } from '../utils/password';
import { log } from '../utils/logger';

/**
 * Script to create initial Super Admin user
 * Run with: npx tsx src/scripts/createSuperAdmin.ts
 */

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    console.log('🔧 Creating Super Admin user...\n');

    const username = 'admin';
    const email = 'admin@fortloot.local';
    const password = 'Admin123!'; // TODO: Change this in production!

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      console.log('⚠️  Super Admin user already exists!');
      console.log(`   Username: ${existingUser.username}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   API Key: ${existingUser.apiKey}\n`);
      console.log('✅ You can use this user to login.\n');
      return;
    }

    // Hash password and generate API key
    console.log('🔐 Hashing password...');
    const passwordHash = await hashPassword(password);

    console.log('🔑 Generating API key...');
    const apiKey = generateApiKey();

    // Create super admin user
    console.log('👤 Creating user in database...');
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        apiKey,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    console.log('\n✅ Super Admin user created successfully!\n');
    console.log('═══════════════════════════════════════════');
    console.log('📋 SUPER ADMIN CREDENTIALS');
    console.log('═══════════════════════════════════════════');
    console.log(`Username:  ${user.username}`);
    console.log(`Email:     ${user.email}`);
    console.log(`Password:  ${password}`);
    console.log(`API Key:   ${user.apiKey}`);
    console.log(`Role:      ${user.role}`);
    console.log('═══════════════════════════════════════════\n');

    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('   1. Change the password immediately after first login!');
    console.log('   2. Store the API key securely - it will not be shown again.');
    console.log('   3. Do not commit these credentials to version control.');
    console.log('   4. Use this account only for initial setup.\n');

    console.log('🚀 You can now login at:');
    console.log('   POST /api/auth/login');
    console.log('   Body: { "username": "admin", "password": "Admin123!" }\n');

    console.log('🔧 Or use the API key directly in headers:');
    console.log(`   x-api-key: ${user.apiKey}\n`);

  } catch (error) {
    console.error('❌ Failed to create Super Admin user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  createSuperAdmin()
    .then(() => {
      console.log('✅ Script completed successfully!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { createSuperAdmin };
