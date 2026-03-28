-- ============================================
-- STOCK RADAR - Migration Phase 3
-- Statuts, Emplacements, Mouvements
-- ============================================

-- Ajouter statut workflow et emplacement aux produits
ALTER TABLE produits ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'recu';
ALTER TABLE produits ADD COLUMN IF NOT EXISTS emplacement TEXT DEFAULT '';

-- Table mouvements de stock (journal)
CREATE TABLE IF NOT EXISTS mouvements (
    id BIGSERIAL PRIMARY KEY,
    produit_id BIGINT REFERENCES produits(id) ON DELETE CASCADE,
    produit_ean TEXT DEFAULT '',
    produit_nom TEXT DEFAULT '',
    type TEXT NOT NULL,
    quantite INTEGER DEFAULT 0,
    de_emplacement TEXT DEFAULT '',
    vers_emplacement TEXT DEFAULT '',
    raison TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS pour mouvements (policy stricte par user_id)
ALTER TABLE mouvements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_mouvements" ON mouvements;
DROP POLICY IF EXISTS "user_mouvements" ON mouvements;
CREATE POLICY "user_mouvements" ON mouvements FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

-- Realtime pour mouvements
ALTER PUBLICATION supabase_realtime ADD TABLE mouvements;
