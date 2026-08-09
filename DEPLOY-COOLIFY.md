# Deploiement de Poulpify via Coolify

Remplace l'ancienne procedure manuelle (Node + PM2 + Nginx sur l'hote) decrite
dans `deployment_guide.md`. Le deploiement est desormais conteneurise et
declenche automatiquement a chaque push sur `main`.

## Architecture

Deux conteneurs sur un reseau Docker prive :

| Service | Image | Role |
|---|---|---|
| `web` | nginx + build Vite | Sert le frontend, proxifie `/api/`, `/login` et `/callback` vers `api` |
| `api` | Node 22 | Backend Express, proxy Spotify, etat de la file d'attente |

Seul `web` est joignable par le proxy Traefik de Coolify, qui termine le TLS.
Aucun port n'est publie sur l'hote : `api` est inatteignable depuis Internet.

Comme `web` et `api` partagent la meme origine publique, `src/config.js` peut
continuer a utiliser des URLs relatives en production — pas de CORS, pas d'URL
d'API a recompiler.

## Configuration dans Coolify

Type d'application : **Docker Compose**, fichier `docker-compose.coolify.yml`.

Variables d'environnement a renseigner dans l'UI :

| Variable | Valeur |
|---|---|
| `FRONTEND_URI` | `https://poulpify.maxboudier.fr` |
| `REDIRECT_URI` | `https://poulpify.maxboudier.fr/callback` |
| `SPOTIFY_CLIENT_ID` | depuis le dashboard Spotify |
| `SPOTIFY_CLIENT_SECRET` | depuis le dashboard Spotify (marquer comme secret) |
| `HOST_PASSWORD` | mot de passe de l'ecran hote (marquer comme secret) |

Le compose refuse de demarrer si l'une d'elles manque, plutot que de tomber sur
un defaut silencieux — notamment `HOST_PASSWORD`, dont la valeur de repli dans
le code est publique.

## Cote Spotify

Dans le [dashboard Spotify](https://developer.spotify.com/dashboard), app
Poulpify > Settings > Redirect URIs, ajouter exactement :

    https://poulpify.maxboudier.fr/callback

Spotify rejette toute URI non enregistree au caractere pres. Les anciennes
entrees en `http://IP:3000/callback` peuvent etre supprimees.

## Ressources allouees

Definies dans `docker-compose.coolify.yml` (`mem_limit` / `cpus`) : 256 Mo et
0,5 vCPU pour l'API, 128 Mo et 0,25 vCPU pour nginx. Ajustables aussi depuis
l'UI Coolify sans toucher au code.

## Limite connue

L'etat de session (file d'attente, votes, heartbeats) vit en memoire dans le
conteneur `api`. Un redeploiement ou un redemarrage le remet a zero, et le
service ne peut pas tourner en plusieurs instances. Acceptable pour l'usage
actuel ; a deplacer vers Redis ou une base si le besoin evolue.
