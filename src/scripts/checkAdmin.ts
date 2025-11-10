import { prisma } from '../database/client';

async function getAdminUsers() {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'SUPER_ADMIN',
      },
      select: {
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log('\n👤 Admin Users Found:');
    console.log('===================');

    if (users.length === 0) {
      console.log('⚠️  No admin users found in database');
      console.log('\nYou need to create a super admin user first.');
      console.log('Run: npm run create:admin');
    } else {
      users.forEach((user) => {
        console.log(`\nUsername: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`Active: ${user.isActive}`);
        console.log(`Created: ${user.createdAt}`);
      });
      console.log('\n⚠️  Note: Passwords are bcrypt hashed and cannot be retrieved.');
      console.log('If you forgot the password, you need to create a new admin user.');
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

getAdminUsers();
