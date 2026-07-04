-- ============================================
-- STOCK RADAR - Import Amazon
-- Colonne anti-doublon sur les ventes : identifiant de la
-- ligne de commande Amazon (order-id|order-item-id).
-- ============================================

ALTER TABLE ventes ADD COLUMN IF NOT EXISTS amazon_order_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ventes_amazon_order
    ON ventes(user_id, amazon_order_id)
    WHERE amazon_order_id <> '';

-- Verrou anti-doublon : une même ligne de commande Amazon ne peut
-- être importée qu'une seule fois par compte (même en cas de double clic)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ventes_amazon
    ON ventes(user_id, amazon_order_id)
    WHERE amazon_order_id <> '';
