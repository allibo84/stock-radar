-- ============================================
-- STOCK RADAR - Migration Fournitures
-- ============================================

CREATE TABLE IF NOT EXISTS fournitures (
    id BIGSERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    categorie TEXT DEFAULT '',
    fournisseur_id BIGINT,
    fournisseur_nom TEXT DEFAULT '',
    quantite INTEGER DEFAULT 1,
    prix_ht NUMERIC(10,2) DEFAULT 0,
    prix_ttc NUMERIC(10,2) DEFAULT 0,
    date_achat DATE,
    recurrent TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    user_id UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fournitures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_fournitures" ON fournitures FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

ALTER PUBLICATION supabase_realtime ADD TABLE fournitures;
