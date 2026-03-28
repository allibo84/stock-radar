-- ============================================
-- STOCK RADAR - Migration FBA en attente
-- Ajoute la colonne fba_attente à la table produits
-- ============================================

ALTER TABLE produits ADD COLUMN IF NOT EXISTS fba_attente BOOLEAN DEFAULT false;

-- Index pour accélérer le filtre sur cette colonne
CREATE INDEX IF NOT EXISTS idx_produits_fba_attente ON produits(user_id, fba_attente) WHERE fba_attente = true;
