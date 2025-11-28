/**
 * Script para re-insertar la orden completada con el modelo LIMPIO
 *
 * Ejecutar: npx ts-node scripts/restoreCompletedOrder.ts
 */

import { prisma } from '../src/database/client';

const data = {
  customer: {
    id: "90550bc8-20d2-4533-bbbc-eaafccde9b37",
    epicAccountId: "08cd913a82004838a3e172e94bf7493a",
    displayName: "08cd913a82004838a3e172e94bf7493a",
    email: "hazelvguerra@gmail.com",
    phoneNumber: null,
    contactPreference: "EMAIL" as const,
    sessionToken: "b6df275cb7ec1988a0c0af0a1267f4e071a001c41ab2a354c7412de1c50e15d8",
    tier: "REGULAR" as const,
    isBlacklisted: false,
    blacklistReason: null,
    totalOrders: 1,
    totalSpent: 1.11,
    lifetimeValue: 0,
    createdAt: new Date("2025-11-18T02:31:57.026Z"),
    updatedAt: new Date()
  },

  order: {
    id: "24f31c38-7851-4dee-9fd2-62b291d3df24",
    orderNumber: "FL-1763606610305-4LH80O40U",
    customerId: "90550bc8-20d2-4533-bbbc-eaafccde9b37",
    status: "COMPLETED" as const,
    priority: "NORMAL" as const,
    basePrice: 1.11,
    discountAmount: 0,
    profitAmount: 0,
    finalPrice: 1.11,
    currency: "USD",
    assignedBotId: "58853c9e-7eb4-4c4f-95b0-06978bb69a3d",
    assignedAt: new Date("2025-11-20T02:46:41.746Z"),
    attempts: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    reassignmentCount: 0,
    estimatedDelivery: null,
    completedAt: new Date("2025-11-20T02:46:46.965Z"),
    failedAt: null,
    expiresAt: new Date("2025-11-20T02:53:30.305Z"),
    checkoutStartedAt: new Date("2025-11-20T02:43:30.305Z"),
    paymentMethod: "Binance",
    paymentProofUrl: "/uploads/payment-proofs/24f31c38-7851-4dee-9fd2-62b291d3df24-1763606619561-Orden_Compra_PO-000005.pdf",
    paymentUploadedAt: new Date("2025-11-20T02:43:39.565Z"),
    paymentVerifiedAt: new Date("2025-11-20T02:46:41.691Z"),
    paymentVerifiedBy: null,
    paymentRejectedReason: null,
    paymentNotes: null,
    transactionId: null,
    failureReason: null,
    progressSteps: [
      {
        step: "CREATED",
        details: "Orden FL-1763606610305-4LH80O40U creada exitosamente",
        timestamp: "2025-11-20T02:43:30.315Z"
      },
      {
        step: "PAYMENT_PENDING",
        details: "Esperando comprobante de pago. Válido hasta 20/11/2025, 2:53:30",
        timestamp: "2025-11-20T02:43:30.321Z"
      },
      {
        step: "PAYMENT_VERIFIED",
        details: "Pago verificado por administrador",
        timestamp: "2025-11-20T02:46:41.699Z"
      },
      {
        step: "QUEUED",
        details: "Orden encolada para procesamiento",
        timestamp: "2025-11-20T02:46:41.733Z"
      },
      {
        step: "BOT_ASSIGNED",
        details: "Bot Fortloot2025.1 asignado",
        timestamp: "2025-11-20T02:46:41.752Z"
      },
      {
        step: "SENDING_GIFT",
        details: "Enviando Stand-Off a 08cd913a82004838a3e172e94bf7493a",
        timestamp: "2025-11-20T02:46:41.770Z"
      },
      {
        step: "GIFT_SENT",
        details: "Regalo enviado exitosamente a 08cd913a82004838a3e172e94bf7493a",
        timestamp: "2025-11-20T02:46:46.970Z"
      }
    ],
    currentStep: "Regalo enviado exitosamente a 08cd913a82004838a3e172e94bf7493a",
    hasManualItems: false,
    metadata: null,
    createdAt: new Date("2025-11-20T02:43:30.307Z"),
    updatedAt: new Date("2025-11-20T02:46:46.971Z")
  },

  orderItem: {
    id: "d9cb55ec-49d1-4512-8717-30867b0abd6c",
    orderId: "24f31c38-7851-4dee-9fd2-62b291d3df24",
    catalogItemId: "687ce7d2-706d-4999-bc64-90589c71aa78",
    productName: "Stand-Off",
    productType: "EMOTE" as const,
    itemId: "687ce7d2-706d-4999-bc64-90589c71aa78",
    quantity: 1,
    basePrice: 1.11,
    profitAmount: 0,
    discountAmount: 0,
    finalPrice: 1.11,
    createdAt: new Date("2025-11-20T02:43:30.307Z"),
    updatedAt: new Date("2025-11-20T02:43:30.307Z")
  },

  gift: {
    id: "c34cdd78-8e75-4de7-871b-ae874df08bf9",
    botId: "58853c9e-7eb4-4c4f-95b0-06978bb69a3d",
    orderId: "24f31c38-7851-4dee-9fd2-62b291d3df24",
    recipientEpicId: "08cd913a82004838a3e172e94bf7493a",
    recipientName: "08cd913a82004838a3e172e94bf7493a",
    itemId: "EID_Stalemate",
    itemName: "Stand-Off",
    status: "SENT" as const,
    queuedAt: new Date("2025-11-20T02:46:41.764Z"),
    sentAt: new Date("2025-11-20T02:46:46.961Z"),
    deliveredAt: null,
    failedAt: null,
    errorMessage: null,
    retryCount: 0,
    metadata: null,
    createdAt: new Date("2025-11-20T02:46:41.764Z"),
    updatedAt: new Date("2025-11-20T02:46:46.962Z")
  }
};

async function restore() {
  console.log('🔄 Restaurando datos de la orden completada...\n');

  try {
    // 1. Crear Customer
    console.log('1️⃣ Creando Customer...');
    const customer = await prisma.customer.create({
      data: data.customer
    });
    console.log(`   ✅ Customer creado: ${customer.displayName}\n`);

    // 2. Crear Order
    console.log('2️⃣ Creando Order...');
    const order = await prisma.order.create({
      data: data.order
    });
    console.log(`   ✅ Order creada: ${order.orderNumber}\n`);

    // 3. Crear OrderItem
    console.log('3️⃣ Creando OrderItem...');
    const orderItem = await prisma.orderItem.create({
      data: data.orderItem
    });
    console.log(`   ✅ OrderItem creado: ${orderItem.productName}\n`);

    // 4. Crear Gift
    console.log('4️⃣ Creando Gift...');
    const gift = await prisma.gift.create({
      data: data.gift
    });
    console.log(`   ✅ Gift creado: ${gift.itemName}\n`);

    // Verificación final
    console.log('📊 Verificando datos restaurados:');
    const verifyOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        customer: true,
        orderItems: true,
        gifts: true
      }
    });

    console.log(`   Order: ${verifyOrder?.orderNumber}`);
    console.log(`   Status: ${verifyOrder?.status}`);
    console.log(`   Customer: ${verifyOrder?.customer?.displayName}`);
    console.log(`   OrderItems: ${verifyOrder?.orderItems.length}`);
    console.log(`   Gifts: ${verifyOrder?.gifts.length}`);

    console.log('\n✅ Restauración completada exitosamente!');

  } catch (error) {
    console.error('❌ Error durante la restauración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

restore();
