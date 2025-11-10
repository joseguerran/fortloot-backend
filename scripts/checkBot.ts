import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBot() {
  try {
    const botId = 'b4b35da4-14a8-4eef-9768-cec68c1b6924';

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      select: {
        id: true,
        name: true,
        status: true,
        epicAccountId: true,
        displayName: true,
        deviceId: true,
        accountId: true,
        isActive: true,
        lastError: true,
        errorCount: true,
        lastHeartbeat: true,
        giftsAvailable: true,
        giftsToday: true,
        vBucks: true,
        createdAt: true,
      },
    });

    if (!bot) {
      console.log('❌ Bot not found in database');
      return;
    }

    console.log('\n📊 Bot Status:\n');
    console.log('ID:', bot.id);
    console.log('Name:', bot.name);
    console.log('Status:', bot.status);
    console.log('Epic Account ID:', bot.epicAccountId);
    console.log('Display Name:', bot.displayName);
    console.log('Device ID:', bot.deviceId);
    console.log('Account ID:', bot.accountId);
    console.log('Is Active:', bot.isActive);
    console.log('Last Error:', bot.lastError || 'None');
    console.log('Error Count:', bot.errorCount);
    console.log('Last Heartbeat:', bot.lastHeartbeat);
    console.log('Gifts Available:', bot.giftsAvailable);
    console.log('Gifts Today:', bot.giftsToday);
    console.log('V-Bucks:', bot.vBucks);
    console.log('Created At:', bot.createdAt);

    // Check if bot has credentials (secret is not selected for security)
    const hasCredentials = bot.deviceId && bot.accountId;
    console.log('\n🔐 Credentials Status:', hasCredentials ? '✅ Present' : '❌ Missing');

    // Check bot health
    const now = new Date();
    const lastHeartbeat = new Date(bot.lastHeartbeat);
    const minutesSinceHeartbeat = Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000 / 60);
    console.log('Minutes since last heartbeat:', minutesSinceHeartbeat);

    if (minutesSinceHeartbeat > 5) {
      console.log('⚠️  WARNING: Bot has not sent heartbeat in over 5 minutes');
    }

    // Get recent activities
    const activities = await prisma.botActivity.findMany({
      where: { botId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('\n📜 Recent Activities:');
    if (activities.length === 0) {
      console.log('No recent activities');
    } else {
      activities.forEach((activity, i) => {
        console.log(`${i + 1}. [${activity.createdAt.toISOString()}] ${activity.type}: ${activity.description}`);
      });
    }

  } catch (error) {
    console.error('Error checking bot:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBot();
