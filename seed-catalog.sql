-- Script para poblar el catálogo con items fijos (V-Bucks, Crew, Bundles)
-- Ejecutar con: psql -U skilin-usr -d fortloot -f seed-catalog.sql

-- Primero, crear el catálogo diario para hoy si no existe
INSERT INTO "DailyCatalog" (id, date, "shopClosesAt", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 day',
  NOW(),
  NOW()
)
ON CONFLICT (date) DO NOTHING;

-- V-BUCKS ITEMS
INSERT INTO "CatalogItem" (
  id,
  "itemId",
  name,
  description,
  type,
  rarity,
  image,
  "baseVbucks",
  "basePriceUsd",
  "profitMargin",
  discount,
  "flashSalePrice",
  "flashSaleEndsAt",
  "isCustom",
  "isActive",
  "requiresManualProcess",
  tags,
  "bundleItems",
  "createdAt",
  "updatedAt"
) VALUES
-- 1,000 V-Bucks
(
  gen_random_uuid(),
  NULL,
  '1,000 Pavomonedas',
  'Pack de 1,000 V-Bucks para Fortnite',
  'VBUCKS',
  NULL,
  '/images/vbucks-1000.png',
  NULL,
  8.49,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['vbucks', 'popular'],
  NULL,
  NOW(),
  NOW()
),
-- 2,800 V-Bucks
(
  gen_random_uuid(),
  NULL,
  '2,800 Pavomonedas',
  'Pack de 2,800 V-Bucks para Fortnite',
  'VBUCKS',
  NULL,
  '/images/vbucks-2800.png',
  NULL,
  22.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['vbucks', 'recommended'],
  NULL,
  NOW(),
  NOW()
),
-- 5,000 V-Bucks
(
  gen_random_uuid(),
  NULL,
  '5,000 Pavomonedas',
  'Pack de 5,000 V-Bucks para Fortnite',
  'VBUCKS',
  NULL,
  '/images/vbucks-5000.png',
  NULL,
  36.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['vbucks', 'best-value'],
  NULL,
  NOW(),
  NOW()
),
-- 13,500 V-Bucks
(
  gen_random_uuid(),
  NULL,
  '13,500 Pavomonedas',
  'Pack de 13,500 V-Bucks para Fortnite - ¡Mejor valor!',
  'VBUCKS',
  NULL,
  '/images/vbucks-13500.png',
  NULL,
  89.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['vbucks', 'best-value', 'premium'],
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- CREW ITEMS
INSERT INTO "CatalogItem" (
  id,
  "itemId",
  name,
  description,
  type,
  rarity,
  image,
  "baseVbucks",
  "basePriceUsd",
  "profitMargin",
  discount,
  "flashSalePrice",
  "flashSaleEndsAt",
  "isCustom",
  "isActive",
  "requiresManualProcess",
  tags,
  "bundleItems",
  "createdAt",
  "updatedAt"
) VALUES
-- Crew 1 Mes (usando BATTLE_PASS como tipo)
(
  gen_random_uuid(),
  NULL,
  'Fortnite Crew - 1 Mes',
  'Suscripción mensual de Fortnite Crew: Pase de batalla + 1,000 V-Bucks + Pack exclusivo',
  'BATTLE_PASS',
  NULL,
  '/images/crew-monthly.png',
  NULL,
  11.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['crew', 'monthly', 'subscription'],
  NULL,
  NOW(),
  NOW()
),
-- Crew 3 Meses (usando BATTLE_PASS como tipo)
(
  gen_random_uuid(),
  NULL,
  'Fortnite Crew - 3 Meses',
  'Suscripción trimestral de Fortnite Crew: Pase de batalla + 3,000 V-Bucks + Packs exclusivos',
  'BATTLE_PASS',
  NULL,
  '/images/crew-quarterly.png',
  NULL,
  32.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  false,
  ARRAY['crew', 'quarterly', 'subscription', 'best-value'],
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- BUNDLE ITEMS
INSERT INTO "CatalogItem" (
  id,
  "itemId",
  name,
  description,
  type,
  rarity,
  image,
  "baseVbucks",
  "basePriceUsd",
  "profitMargin",
  discount,
  "flashSalePrice",
  "flashSaleEndsAt",
  "isCustom",
  "isActive",
  "requiresManualProcess",
  tags,
  "bundleItems",
  "createdAt",
  "updatedAt"
) VALUES
-- Lote Legendario
(
  gen_random_uuid(),
  NULL,
  'Lote Legendario',
  'Pack legendario con skin exclusiva, pico, ala delta y mochila',
  'BUNDLE',
  NULL,
  '/images/bundle-legendary.png',
  NULL,
  39.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  true,
  ARRAY['bundle', 'legendary', 'complete-set'],
  '[{"type":"SKIN","quantity":1},{"type":"PICKAXE","quantity":1},{"type":"GLIDER","quantity":1},{"type":"BACKPACK","quantity":1}]'::jsonb,
  NOW(),
  NOW()
),
-- Lote Futurista
(
  gen_random_uuid(),
  NULL,
  'Lote Futurista',
  'Pack futurista con skin + accesorios tecnológicos',
  'BUNDLE',
  NULL,
  '/images/bundle-futuristic.png',
  NULL,
  29.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  true,
  ARRAY['bundle', 'futuristic', 'tech'],
  '[{"type":"SKIN","quantity":1},{"type":"PICKAXE","quantity":1},{"type":"BACKPACK","quantity":1}]'::jsonb,
  NOW(),
  NOW()
),
-- Lote Oscuro
(
  gen_random_uuid(),
  NULL,
  'Lote Oscuro',
  'Pack oscuro con skin sombría + accesorios',
  'BUNDLE',
  NULL,
  '/images/bundle-dark.png',
  NULL,
  24.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  true,
  ARRAY['bundle', 'dark', 'shadow'],
  '[{"type":"SKIN","quantity":1},{"type":"PICKAXE","quantity":1}]'::jsonb,
  NOW(),
  NOW()
),
-- Pack Soledad
(
  gen_random_uuid(),
  NULL,
  'Pack Soledad',
  'Pack temático de soledad con skin única + accesorios',
  'BUNDLE',
  NULL,
  '/images/bundle-soledad.png',
  NULL,
  19.99,
  NULL,
  0,
  NULL,
  NULL,
  true,
  true,
  true,
  ARRAY['bundle', 'themed'],
  '[{"type":"SKIN","quantity":1},{"type":"EMOTE","quantity":1}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Vincular todos los items custom al catálogo de hoy
INSERT INTO "DailyCatalogItem" (id, "catalogId", "itemId", "dayPrice")
SELECT
  gen_random_uuid() as id,
  dc.id as "catalogId",
  ci.id as "itemId",
  NULL as "dayPrice"
FROM "DailyCatalog" dc
CROSS JOIN "CatalogItem" ci
WHERE dc.date = CURRENT_DATE
  AND ci."isCustom" = true
  AND ci."isActive" = true
ON CONFLICT ("catalogId", "itemId") DO NOTHING;

-- Mostrar resumen de lo creado
SELECT
  type,
  COUNT(*) as cantidad,
  SUM(CASE WHEN "isActive" THEN 1 ELSE 0 END) as activos
FROM "CatalogItem"
WHERE "isCustom" = true
GROUP BY type
ORDER BY type;

-- Mostrar items en el catálogo de hoy
SELECT
  COUNT(*) as "Total Items en Catálogo Hoy"
FROM "DailyCatalogItem" dci
JOIN "DailyCatalog" dc ON dci."catalogId" = dc.id
WHERE dc.date = CURRENT_DATE;
