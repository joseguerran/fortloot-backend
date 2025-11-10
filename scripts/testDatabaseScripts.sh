#!/bin/bash

# Script de prueba para validar los scripts de base de datos
# Este script limpia y re-inicializa la base de datos para testing

echo "🧪 Testing Database Scripts"
echo "=================================================="
echo ""
echo "⚠️  WARNING: This will clean your database!"
echo "This script is for LOCAL TESTING ONLY"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para mostrar paso
step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}$1${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Función para mostrar éxito
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Función para mostrar error
error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    error "Please run this script from the backend directory"
fi

# Verificar que existe la base de datos
step "STEP 1: Verify Database Connection"
if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
    success "Database connection OK"
else
    error "Cannot connect to database. Check your DATABASE_URL in .env"
fi

# Contar bots antes de la limpieza
step "STEP 2: Count Bots Before Cleanup"
BOT_COUNT_BEFORE=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"Bot\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Bots in database: $BOT_COUNT_BEFORE"

if [ "$BOT_COUNT_BEFORE" = "0" ]; then
    echo -e "${YELLOW}⚠️  No bots found. This is OK for a fresh database.${NC}"
fi

# Ejecutar limpieza
step "STEP 3: Running Database Cleanup"
echo "This will preserve bots but delete all other data..."
# Simular respuesta "yes" dos veces (confirmación general y confirmación de usuarios)
echo -e "yes\nyes" | npm run db:clean

if [ $? -eq 0 ]; then
    success "Database cleaned successfully"
else
    error "Database cleanup failed"
fi

# Verificar que los bots se preservaron
step "STEP 4: Verify Bots Preserved"
BOT_COUNT_AFTER=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"Bot\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Bots after cleanup: $BOT_COUNT_AFTER"

if [ "$BOT_COUNT_BEFORE" = "$BOT_COUNT_AFTER" ]; then
    success "Bots preserved correctly ($BOT_COUNT_AFTER bots)"
else
    error "Bot count changed! Before: $BOT_COUNT_BEFORE, After: $BOT_COUNT_AFTER"
fi

# Ejecutar seed
step "STEP 5: Running Database Seed"
npm run db:seed

if [ $? -eq 0 ]; then
    success "Database seeded successfully"
else
    error "Database seed failed"
fi

# Verificar datos creados
step "STEP 6: Verify Seeded Data"

# Verificar usuarios
USER_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"User\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Users created: $USER_COUNT"

# Verificar métodos de pago
PAYMENT_METHODS=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"PaymentMethod\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Payment methods: $PAYMENT_METHODS"

# Verificar tiers
TIERS=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"CustomerTier\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Customer tiers: $TIERS"

# Verificar pricing rules
PRICING_RULES=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"PricingRule\";" 2>/dev/null | tail -1 | tr -d ' ')
echo "Pricing rules: $PRICING_RULES"

# Validar que se crearon los datos esperados
if [ "$USER_COUNT" -ge "1" ] && [ "$PAYMENT_METHODS" -ge "3" ] && [ "$TIERS" -ge "4" ] && [ "$PRICING_RULES" -ge "2" ]; then
    success "All seed data created correctly"
else
    error "Some seed data is missing"
fi

# Resumen final
step "STEP 7: Final Summary"
echo ""
echo "📊 Database State:"
echo "  - Users: $USER_COUNT"
echo "  - Bots: $BOT_COUNT_AFTER"
echo "  - Payment Methods: $PAYMENT_METHODS"
echo "  - Customer Tiers: $TIERS"
echo "  - Pricing Rules: $PRICING_RULES"
echo ""
success "All tests passed!"
echo ""
echo "🔐 Admin Credentials:"
echo "   Email: admin@fortloot.com"
echo "   Password: Admin123!"
echo ""
echo "💡 Next steps:"
echo "   1. npm run dev        # Start the server"
echo "   2. npm run db:studio  # Open Prisma Studio to view data"
echo ""
