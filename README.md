<p align="center">
  <img src="./poulpify_banner.png" alt="Poulpify Banner" width="100%">
</p>

# 🐙 Poulpify

[![Vue.js](https://img.shields.io/badge/Vue.js-3.x-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-4.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Spotify](https://img.shields.io/badge/Spotify-API-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://developer.spotify.com/)

**Poulpify** est une application web collaborative qui permet à vos amis d'ajouter des morceaux à votre file d'attente Spotify en temps réel. Plus besoin de passer votre téléphone à tout le monde lors d'une soirée !

---

## ✨ Fonctionnalités

- 🎵 **File d'attente Collaborative** : Permettez à n'importe qui d'ajouter des titres à votre lecture Spotify sans partager vos identifiants.
- 🎤 **Mode Karaoke** : Affichez les paroles et vibrez au rythme de la musique avec une interface dédiée.
- 🗳️ **Vote pour Skip** : Un système de vote démocratique pour passer à la chanson suivante si le morceau actuel ne plaît pas.
- 📱 **Interface Mobile First** : Conçu pour être utilisé sur smartphone, avec un lecteur fluide et intuitif.
- 🔒 **Contrôle de l'Hôte** : Verrouillez la file d'attente ou gérez les permissions depuis votre interface administrateur.
- 🔗 **Partage Facile** : Générez un QR code pour que vos invités rejoignent la session instantanément.

---

## 🚀 Stack Technique

### Frontend
- **Vue.js 3** : Framework réactif pour l'interface utilisateur.
- **Vite** : Outil de build ultra-rapide.
- **Vanilla CSS** : Design personnalisé et performant.

### Backend
- **Node.js & Express** : Serveur API pour gérer l'authentification et les requêtes Spotify.
- **Spotify Web API** : Intégration profonde avec les services de streaming.

---

## 🛠️ Installation & Configuration

### Pré-requis
- Un compte [Spotify Developer](https://developer.spotify.com/dashboard/)
- Node.js (v18+)
- npm ou yarn

### 1. Cloner le projet
```bash
git clone https://github.com/votre-username/Poulpify.git
cd Poulpify
```

### 2. Configuration du Backend
Créez un fichier `.env` dans le dossier `/server` :
```env
SPOTIFY_CLIENT_ID=votre_client_id
SPOTIFY_CLIENT_SECRET=votre_client_secret
REDIRECT_URI=http://localhost:3000/callback
FRONTEND_URI=http://localhost:5173
HOST_PASSWORD=votre_mot_de_passe_admin
```

Installez les dépendances et lancez le serveur :
```bash
cd server
npm install
npm start
```

### 3. Configuration du Frontend
Installez les dépendances et lancez le client :
```bash
# De retour à la racine du projet
npm install
npm run dev
```

---

## 🎨 Design

Poulpify arbore une identité visuelle **Rose & Néon**, inspirée par l'univers nocturne et festif. L'interface utilise des dégradés fluides et des micro-animations pour une expérience utilisateur premium.

---

## 📝 Licence

Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.

---

<p align="center"> Fait avec ❤️ par la team Poulpify </p>
