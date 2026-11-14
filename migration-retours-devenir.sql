-- ============================================
-- STOCK RADAR - Migration « devenir des retours »
-- Ce que devient chaque produit remboursé : revenu en stock Amazon, invendable chez Amazon,
-- non revenu et remboursé par Amazon, reçu chez vous, revendu (Vinted, Leboncoin…), au rebut.
-- Sans danger à relancer.
-- ============================================

ALTER TABLE retours ADD COLUMN IF NOT EXISTS devenir TEXT DEFAULT '';
ALTER TABLE retours ADD COLUMN IF NOT EXISTS devenir_source TEXT DEFAULT '';      -- amazon / auto / manuel
ALTER TABLE retours ADD COLUMN IF NOT EXISTS date_devenir DATE;
ALTER TABLE retours ADD COLUMN IF NOT EXISTS valeur_recuperee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE retours ADD COLUMN IF NOT EXISTS canal_revente TEXT DEFAULT '';
ALTER TABLE retours ADD COLUMN IF NOT EXISTS note_devenir TEXT DEFAULT '';
ALTER TABLE retours ADD COLUMN IF NOT EXISTS asin TEXT DEFAULT '';
ALTER TABLE retours ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT '';        -- état constaté par Amazon (SELLABLE, CUSTOMER_DAMAGED…)
ALTER TABLE retours ADD COLUMN IF NOT EXISTS raison_retour TEXT DEFAULT '';      -- motif donné par le client
