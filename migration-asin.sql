-- ============================================
-- STOCK RADAR - Migration ASIN
-- ============================================

ALTER TABLE produits ADD COLUMN IF NOT EXISTS asin TEXT DEFAULT '';
ALTER TABLE achats ADD COLUMN IF NOT EXISTS asin TEXT DEFAULT '';
