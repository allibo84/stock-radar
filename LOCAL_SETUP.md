# Stock Radar — lancement local Windows

Cette branche ajoute uniquement un lanceur local Windows. Elle ne modifie pas la logique métier de Stock Radar.

## Lancer Stock Radar

1. Installer Python 3 si nécessaire.
2. Télécharger/cloner cette branche du dépôt.
3. Double-cliquer sur `LANCER_STOCK_RADAR.bat`.
4. Le navigateur s'ouvre sur `http://127.0.0.1:8080`.
5. Laisser la fenêtre noire ouverte pendant l'utilisation.
6. Fermer la fenêtre noire pour arrêter le serveur local.

## Architecture actuelle

Stock Radar reste une application web HTML/JavaScript connectée à Supabase. Le serveur Python lancé ici sert uniquement les fichiers localement ; il ne remplace pas Supabase et ne déplace pas encore les données sur le PC.

## Étapes suivantes prévues

- Vérifier toutes les fonctions existantes en local.
- Identifier les dépendances cloud à conserver ou à remplacer.
- Structurer le futur module Marketplace (Vinted / Leboncoin) sans toucher à Nexo Radar.
- Préparer ensuite une architecture portable vers un mini-PC.
