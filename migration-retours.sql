-- ============================================
-- STOCK RADAR - Migration table retours
-- Remboursements clients lus dans le rapport de transactions Amazon
-- Sans danger à relancer.
-- ============================================

CREATE TABLE IF NOT EXISTS retours (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    amazon_order_id TEXT DEFAULT '',
    sku TEXT DEFAULT '',
    produit_id BIGINT REFERENCES produits(id) ON DELETE SET NULL,
    vente_id BIGINT REFERENCES ventes(id) ON DELETE SET NULL,
    produit_nom TEXT DEFAULT '',
    marketplace TEXT DEFAULT '',
    date_retour DATE,
    quantite INTEGER DEFAULT 1,
    montant_produit NUMERIC(10,2) DEFAULT 0,   -- prix du produit remboursé au client (positif)
    total NUMERIC(10,2) DEFAULT 0,             -- effet net sur le compte vendeur (négatif en général)
    cle TEXT NOT NULL,                         -- anti-doublon : commande | sku | date | total
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_retours_cle ON retours(user_id, cle);
CREATE INDEX IF NOT EXISTS idx_retours_user_date ON retours(user_id, date_retour DESC);

ALTER TABLE retours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_retours" ON retours;
CREATE POLICY "user_retours" ON retours
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));
