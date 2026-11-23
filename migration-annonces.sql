-- ============================================
-- STOCK RADAR - Migration « Vinted / Leboncoin »
-- annonces : les articles à revendre sur Vinted ou Leboncoin, de la mise en ligne à la vente.
-- Sans danger à relancer.
-- ============================================

CREATE TABLE IF NOT EXISTS annonces (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    produit_id BIGINT REFERENCES produits(id) ON DELETE CASCADE,
    retour_id BIGINT REFERENCES retours(id) ON DELETE SET NULL,
    canal TEXT DEFAULT 'Vinted',          -- Vinted / Leboncoin
    statut TEXT DEFAULT 'a_mettre',        -- a_mettre / en_ligne / vendu / retire
    etat TEXT DEFAULT 'neuf',              -- neuf / abime
    quantite INTEGER DEFAULT 1,
    prix_conseille NUMERIC(10,2) DEFAULT 0,
    prix_annonce NUMERIC(10,2) DEFAULT 0,
    lien TEXT DEFAULT '',
    date_en_ligne DATE,
    date_vente DATE,
    prix_vente NUMERIC(10,2) DEFAULT 0,
    vente_id BIGINT REFERENCES ventes(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annonces_user_statut ON annonces(user_id, statut);
ALTER TABLE annonces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_annonces" ON annonces;
CREATE POLICY "user_annonces" ON annonces
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));
