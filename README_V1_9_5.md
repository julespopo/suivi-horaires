# Suivi horaires V1.9.5

## Changements
- Un PIN erroné affiche maintenant « PIN incorrect. » sur l'espace employé et le pilotage.
- La pause du jour est directement modifiable en minutes dans le bloc PAUSE.
- Le compteur de pause reste disponible : ▶ démarre, Ⅱ termine.
- Pendant qu'une pause est en cours, la modification manuelle des minutes est désactivée pour éviter les conflits.
- Si une pause a été oubliée, l'employé peut saisir directement le nombre total de minutes.
- La modification manuelle de pause fonctionne aussi hors ligne et rejoint la file de synchronisation existante.
- Le cache du service worker passe en V1.9.5.
- Aucun changement Supabase n'est requis pour cette version : `pause_minutes` et les RPC existants sont réutilisés.
