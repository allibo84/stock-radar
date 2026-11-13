-- ============================================
-- STOCK RADAR - Migration réception partielle
-- ============================================
-- Nombre d'unités d'un achat déjà entrées en stock.
-- NULL = achat antérieur à cette fonction (on se fie alors à la colonne recu).
-- Sans danger à relancer.

ALTER TABLE achats ADD COLUMN IF NOT EXISTS quantite_recue INTEGER;
