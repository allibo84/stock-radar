-- ============================================
-- STOCK RADAR - Migration table ventes
-- Historique complet des ventes par ligne
-- ============================================

-- 1. Créer la table ventes
CREATE TABLE IF NOT EXISTS ventes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    produit_id BIGINT REFERENCES produits(id) ON DELETE SET NULL,
    produit_ean TEXT DEFAULT '',
    produit_nom TEXT DEFAULT '',
    canal TEXT DEFAULT 'Autre',
    quantite INTEGER DEFAULT 1,
    prix_unitaire NUMERIC(10,2) DEFAULT 0,
    prix_total NUMERIC(10,2) DEFAULT 0,
    prix_achat_unitaire NUMERIC(10,2) DEFAULT 0,
    frais NUMERIC(10,2) DEFAULT 0,
    benefice NUMERIC(10,2) DEFAULT 0,
    date_vente DATE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS strict
ALTER TABLE ventes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_ventes" ON ventes;
CREATE POLICY "user_ventes" ON ventes
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE ventes;

-- 4. Ajouter produit_genere_id sur achats pour empêcher les doublons de réception
ALTER TABLE achats ADD COLUMN IF NOT EXISTS produit_genere_id BIGINT REFERENCES produits(id) ON DELETE SET NULL;

-- 5. Index utiles
CREATE INDEX IF NOT EXISTS idx_ventes_user_date ON ventes(user_id, date_vente DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_produit ON ventes(produit_id);
CREATE INDEX IF NOT EXISTS idx_achats_produit_genere ON achats(produit_genere_id);

-- 6. Migrer les ventes existantes depuis produits (si vendu = true)
--    On insère une ligne de vente pour chaque produit déjà vendu (migration one-shot)
INSERT INTO ventes (user_id, produit_id, produit_ean, produit_nom, canal, quantite, prix_unitaire, prix_total, prix_achat_unitaire, frais, benefice, date_vente, notes)
SELECT
    p.user_id,
    p.id,
    p.ean,
    p.nom,
    COALESCE(p.plateforme_vente, 'Autre'),
    COALESCE(p.quantite, 1),
    COALESCE(p.prix_vente_reel, 0),
    COALESCE(p.prix_vente_reel, 0) * COALESCE(p.quantite, 1),
    COALESCE(p.prix_achat, 0),
    0,
    (COALESCE(p.prix_vente_reel, 0) - COALESCE(p.prix_achat, 0)) * COALESCE(p.quantite, 1),
    COALESCE(p.date_vente::DATE, CURRENT_DATE),
    '[Migration depuis stock]'
FROM produits p
WHERE p.vendu = true
  AND NOT EXISTS (
      SELECT 1 FROM ventes v WHERE v.produit_id = p.id
  );
