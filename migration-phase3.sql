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

-- RLS pour mouvements
ALTER TABLE mouvements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_mouvements" ON mouvements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime pour mouvements
ALTER PUBLICATION supabase_realtime ADD TABLE mouvements;
