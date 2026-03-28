-- ============================================
-- STOCK RADAR - Migration mouvements fix
-- Ajoute user_id + RLS propre à la table mouvements
-- ============================================

-- 1. Ajouter la colonne user_id (si absente)
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();

-- 2. Remplir user_id sur les lignes existantes qui n'en ont pas
--    On tente de le récupérer depuis le produit_id lié
UPDATE mouvements m
SET user_id = p.user_id
FROM produits p
WHERE m.produit_id = p.id
  AND m.user_id IS NULL;

-- 3. Supprimer l'ancienne policy trop permissive
DROP POLICY IF EXISTS "auth_mouvements" ON mouvements;

-- 4. Créer une policy RLS stricte identique aux autres tables
CREATE POLICY "user_mouvements" ON mouvements
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR auth.uid() IN (SELECT user_id FROM app_admins)
    )
    WITH CHECK (
        user_id = auth.uid()
        OR auth.uid() IN (SELECT user_id FROM app_admins)
    );

-- 5. S'assurer que RLS est bien activé
ALTER TABLE mouvements ENABLE ROW LEVEL SECURITY;
