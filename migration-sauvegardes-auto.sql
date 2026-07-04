-- ============================================
-- STOCK RADAR - Sauvegardes automatiques
-- Instantané quotidien de toutes les données par utilisateur,
-- conservé 14 jours, via pg_cron (planificateur intégré Supabase).
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================

-- 1. Activer le planificateur pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Table des sauvegardes
CREATE TABLE IF NOT EXISTS sauvegardes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    donnees JSONB NOT NULL,
    taille_octets BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sauvegardes_user_date ON sauvegardes(user_id, created_at DESC);

-- 3. RLS : chaque utilisateur ne voit que ses sauvegardes (l'admin voit tout)
ALTER TABLE sauvegardes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_sauvegardes" ON sauvegardes;
CREATE POLICY "user_sauvegardes" ON sauvegardes
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins))
    WITH CHECK (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM app_admins));

-- 4. Fonction qui crée un instantané par utilisateur
--    NOTE : les photos des produits sont exclues de l'instantané
--    (elles resteraient trop lourdes en 14 copies quotidiennes).
--    La sauvegarde manuelle depuis l'app les contient toujours.
CREATE OR REPLACE FUNCTION creer_sauvegardes_auto() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    u RECORD;
    snapshot JSONB;
BEGIN
    FOR u IN
        SELECT DISTINCT user_id FROM (
            SELECT user_id FROM produits WHERE user_id IS NOT NULL
            UNION SELECT user_id FROM achats WHERE user_id IS NOT NULL
            UNION SELECT user_id FROM fournisseurs WHERE user_id IS NOT NULL
        ) t
    LOOP
        snapshot := jsonb_build_object(
            'version', 'stock-radar-v2',
            'date', NOW(),
            'user_id', u.user_id,
            'auto', true,
            'fournisseurs', (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM fournisseurs x WHERE x.user_id = u.user_id),
            'achats',       (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM achats x WHERE x.user_id = u.user_id),
            'produits',     (SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'photos'), '[]'::jsonb) FROM produits x WHERE x.user_id = u.user_id),
            'factures',     (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM factures x WHERE x.user_id = u.user_id),
            'fournitures',  (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM fournitures x WHERE x.user_id = u.user_id),
            'mouvements',   (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM mouvements x WHERE x.user_id = u.user_id),
            'ventes',       (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM ventes x WHERE x.user_id = u.user_id)
        );

        INSERT INTO sauvegardes (user_id, donnees, taille_octets)
        VALUES (u.user_id, snapshot, pg_column_size(snapshot));
    END LOOP;

    -- Purge : ne garder que les 14 derniers jours
    DELETE FROM sauvegardes WHERE created_at < NOW() - INTERVAL '14 days';
END;
$$;

-- 5. Planifier : tous les jours à 03h00 (UTC)
SELECT cron.unschedule('sauvegarde-quotidienne')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sauvegarde-quotidienne');
SELECT cron.schedule('sauvegarde-quotidienne', '0 3 * * *', 'SELECT creer_sauvegardes_auto()');

-- 6. Créer une première sauvegarde immédiatement (pour vérifier que tout marche)
SELECT creer_sauvegardes_auto();
