-- ============================================
-- STOCK RADAR - Migration « Entrepôt »
--  1. emplacements : les étagères du local (A1, A2, B1…), une étiquette chacune
--  2. rangements   : combien d'unités de chaque produit sont sur chaque étagère
--     (un produit peut être réparti sur plusieurs étagères)
-- Sans danger à relancer.
-- ============================================

CREATE TABLE IF NOT EXISTS emplacements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    code TEXT NOT NULL,
    libelle TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_emplacements_code ON emplacements(user_id, code);
ALTER TABLE emplacements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_emplacements" ON emplacements;
CREATE POLICY "user_emplacements" ON emplacements
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

CREATE TABLE IF NOT EXISTS rangements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    produit_id BIGINT REFERENCES produits(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    quantite INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rangements ON rangements(user_id, produit_id, code);
CREATE INDEX IF NOT EXISTS idx_rangements_code ON rangements(user_id, code);
ALTER TABLE rangements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_rangements" ON rangements;
CREATE POLICY "user_rangements" ON rangements
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));
