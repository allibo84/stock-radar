-- ============================================
-- STOCK RADAR - Migration « Amazon v2 »
--  1. Pays de chaque vente (ventes.marketplace)
--  2. Opérations Amazon hors ventes, lues dans le rapport de transactions :
--     remboursements FBA (stock perdu, abîmé…), transport entrant, stockage,
--     abonnement, étiquettes, éco-contribution…
--  3. Envois FBA (quantités envoyées / reçues par Amazon), lus par l'extension
-- Sans danger à relancer.
-- ============================================

ALTER TABLE ventes ADD COLUMN IF NOT EXISTS marketplace TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS amazon_operations (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    date_op DATE,
    type TEXT DEFAULT '',           -- type Amazon tel qu'écrit dans le rapport (Ajustement, Frais de service…)
    categorie TEXT DEFAULT '',      -- remboursement_fba, transport, stockage, abonnement, expedition, autre
    description TEXT DEFAULT '',
    sku TEXT DEFAULT '',
    produit_id BIGINT REFERENCES produits(id) ON DELETE SET NULL,
    produit_nom TEXT DEFAULT '',
    quantite INTEGER DEFAULT 0,
    marketplace TEXT DEFAULT '',
    total NUMERIC(10,2) DEFAULT 0,  -- effet sur le compte vendeur (positif = Amazon vous paie)
    cle TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_amazon_operations_cle ON amazon_operations(user_id, cle);
CREATE INDEX IF NOT EXISTS idx_amazon_operations_user_date ON amazon_operations(user_id, date_op DESC);
ALTER TABLE amazon_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_amazon_operations" ON amazon_operations;
CREATE POLICY "user_amazon_operations" ON amazon_operations
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

CREATE TABLE IF NOT EXISTS envois_fba (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    shipment_id TEXT NOT NULL,
    nom TEXT DEFAULT '',
    statut TEXT DEFAULT '',
    destination TEXT DEFAULT '',
    pays TEXT DEFAULT '',
    nb_sku INTEGER DEFAULT 0,
    qte_envoyee INTEGER DEFAULT 0,
    qte_recue INTEGER DEFAULT 0,
    date_creation TIMESTAMPTZ,
    date_maj TIMESTAMPTZ,
    traite BOOLEAN DEFAULT FALSE,   -- écart vérifié / réclamé : à cocher par vous
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_envois_fba ON envois_fba(user_id, shipment_id);
ALTER TABLE envois_fba ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_envois_fba" ON envois_fba;
CREATE POLICY "user_envois_fba" ON envois_fba
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));
