-- ============================================
-- STOCK RADAR - Import Amazon
-- Colonne anti-doublon sur les ventes : identifiant de la
-- ligne de commande Amazon (order-id|order-item-id).
-- ============================================

ALTER TABLE ventes ADD COLUMN IF NOT EXISTS amazon_order_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ventes_amazon_order
    ON ventes(user_id, amazon_order_id)
    WHERE amazon_order_id <> '';
