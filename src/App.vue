<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import Head from "@/components/Head.vue";
import MobilePlayer from "@/components/MobilePlayer.vue";
import SearchArea from "@/components/SearchArea.vue";
import GuestWelcome from "@/components/GuestWelcome.vue";
import { API_BASE_URL } from '@/config';

const isAuthenticated = ref(false);
const isQueueLocked = ref(false);
const isHostActiveGlobally = ref(false); // Indicates if ANY host is active on the server
const isLocalHost = ref(!!localStorage.getItem('poulpify_host_token')); 
const hostPassword = ref('');
const autoDisconnectEnabled = ref(true);
const hostToken = ref(localStorage.getItem('poulpify_host_token') || null);

const showHostLogin = ref(false);
const showSearch = ref(false);
const showShareQR = ref(false);
const shareUrl = ref(window.location.origin);
const currentUsername = ref('');
const currentEmoji = ref('😎');
const guestWelcomeRef = ref(null);

const handleRegistration = (data) => {
    currentUsername.value = data.name;
    currentEmoji.value = data.emoji;
};

const checkAuth = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/status`);
        isAuthenticated.value = response.data.authenticated;
        isQueueLocked.value = response.data.queueLocked;
        isHostActiveGlobally.value = response.data.hostActive;
        autoDisconnectEnabled.value = response.data.autoDisconnectEnabled;
    } catch (e) {
        isAuthenticated.value = false;
    }
};

const loginHost = async () => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/host/login`, { password: hostPassword.value });
        if (response.data.success) {
            hostToken.value = response.data.hostToken;
            localStorage.setItem('poulpify_host_token', hostToken.value);
            isLocalHost.value = true;
            isHostActiveGlobally.value = true;
            isAuthenticated.value = response.data.spotifyAuthenticated;
        }
    } catch (e) {
        alert('Mot de passe incorrect.');
    }
};

const logoutHost = async () => {
    if (!hostToken.value) return;
    try {
        await axios.post(`${API_BASE_URL}/api/host/logout`, {}, {
            headers: { Authorization: `Bearer ${hostToken.value}` }
        });
        hostToken.value = null;
        localStorage.removeItem('poulpify_host_token');
        isLocalHost.value = false;
        isHostActiveGlobally.value = false;
        isAuthenticated.value = false;
        isQueueLocked.value = false;
    } catch (e) {
        alert('Erreur lors de la déconnexion.');
    }
};

const toggleQueueLock = async () => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/toggle-lock`, {}, {
            headers: { Authorization: `Bearer ${hostToken.value}` }
        });
        isQueueLocked.value = response.data.queueLocked;
    } catch (e) {
        alert('Échec. Êtes-vous bien l\'hôte de la session ?');
    }
};

const toggleAutoDisconnect = async () => {
    try {
        const response = await axios.post(`${API_BASE_URL}/api/host/config`, {
            autoDisconnectEnabled: !autoDisconnectEnabled.value
        }, {
            headers: { Authorization: `Bearer ${hostToken.value}` }
        });
        autoDisconnectEnabled.value = response.data.autoDisconnectEnabled;
    } catch (e) {
        alert('Erreur lors du changement de paramètre.');
    }
};

const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl.value);
    alert('Lien copié dans le presse-papier !');
};

onMounted(() => {
    checkAuth();
    setInterval(checkAuth, 2000); // Poll status every 2s to detect disconnect
    if (window.location.search.includes('loggedIn=true')) {
        isAuthenticated.value = true;
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
</script>

<template>
  <GuestWelcome v-if="isAuthenticated" ref="guestWelcomeRef" @registered="handleRegistration" />

  <header class="app-header">
    <div class="header-left">
        <!-- Logo Brand -->
        <div class="brand" @click="showHostLogin = !showHostLogin">
            <img src="./assets/images/poulpify_logo.png" alt="Poulpify Logo" class="brand-logo" />
            <h1 class="brand-title">Poulpify</h1>
        </div>
    </div>
    
    <div class="header-right">
        <!-- User Badge -->
        <div class="user-badge" v-if="currentUsername" @click="guestWelcomeRef?.openProfile()" title="Modifier le profil">
            <span class="user-avatar">{{ currentEmoji }}</span>
            <span class="user-name">{{ currentUsername }}</span>
        </div>

        <!-- Share Button -->
        <button @click="showShareQR = true" class="share-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
        </button>
    </div>
  </header>
  
  <div v-if="showHostLogin" class="host-login z-high">
    <div v-if="isLocalHost">
        <div v-if="isAuthenticated" class="host-controls">
            <p>✅ Spotify Connecté</p>
            <label class="toggle-label">
                <input type="checkbox" :checked="autoDisconnectEnabled" @change="toggleAutoDisconnect" />
                Déconnexion auto si inactif
            </label>
            <button @click="toggleQueueLock" class="lock-btn" :class="{ 'is-locked': isQueueLocked }">
                {{ isQueueLocked ? '🔓 Déverrouiller la file' : '🔒 Verrouiller la file' }}
            </button>
            <button @click="logoutHost" class="logout-btn">❌ Déconnecter la session hôte</button>
        </div>
        <a v-else :href="`${API_BASE_URL}/login?hostToken=${hostToken}`" class="login-btn">Connexion à Spotify (Hôte)</a>
        
        <div v-if="!isAuthenticated" class="mt-4">
            <button @click="logoutHost" class="logout-btn-sm">Se déconnecter</button>
        </div>
    </div>
    <div v-else class="host-auth-form">
        <p v-if="isHostActiveGlobally" class="host-warn">Une session hôte est déjà active sur le serveur. Vous devez avoir le mot de passe pour la reprendre.</p>
        <p v-else class="host-info">Devenez l'hôte pour gérer la file d'attente.</p>
        
        <div class="password-input-group">
            <input type="password" v-model="hostPassword" placeholder="Mot de passe Hôte" @keyup.enter="loginHost" />
            <button @click="loginHost">Valider</button>
        </div>
    </div>
  </div>

  <main class="app-main" v-if="isAuthenticated">
    <MobilePlayer />
  </main>
  
  <div v-else class="session-closed">
     <div class="closed-content">
        <img src="./assets/images/poulpify_logo.png" width="100" />
        <h2>Session fermée 🐙</h2>
        <p>En attente du retour de l'hôte...</p>
     </div>
  </div>

  <SearchArea v-if="showSearch && isAuthenticated" @close="showSearch = false" />

  <!-- Floating Search Button -->
  <button class="fab-search" @click="showSearch = true" v-if="!showSearch && isAuthenticated">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
  </button>

  <!-- Share Modal -->
  <div v-if="showShareQR" class="qr-modal" @click.self="showShareQR = false">
    <div class="qr-content">
        <button class="modal-close-icon" @click="showShareQR = false">×</button>
        <div class="qr-header">
            <h2>Rejoindre la session</h2>
            <p>Scannez pour vous connecter et ajouter des sons.</p>
        </div>
        <div class="qr-code-wrapper">
             <img src="./assets/images/poulpify_qrcode.png" alt="QR Code" />
        </div>
        <div class="url-copy-box" @click="copyToClipboard" title="Cliquez pour copier le lien">
            <span class="qr-url">{{ shareUrl }}</span>
            <div class="copy-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            </div>
        </div>
        <button class="close-qr-btn" @click="showShareQR = false">Fermer</button>
    </div>
  </div>

</template>

<style scoped>
.app-header {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 100;
    padding: 30px 20px 0 20px;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;
    pointer-events: none;
}

.header-left, .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: transform 0.2s;
}

.brand:active {
    transform: scale(0.95);
}

.brand-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

.brand-title {
    color: white;
    font-size: 26px;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.8px;
    text-shadow: 0 4px 10px rgba(0,0,0,0.8);
}

.share-btn {
    pointer-events: auto;
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.2);
    color: white;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s, background 0.2s;
}

.share-btn:active {
    transform: scale(0.9);
    background: rgba(255,255,255,0.2);
}

.user-badge {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 6px 12px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    backdrop-filter: blur(10px);
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
}

.user-badge:active {
    transform: scale(0.95);
}

.user-badge:hover {
    background: rgba(255, 255, 255, 0.15);
}

.user-avatar {
    font-size: 14px;
}

.user-name {
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    font-size: 13px;
}

.z-high {
    z-index: 101;
    position: relative;
}

.host-login {
    position: absolute;
    top: 80px;
    left: 20px;
    background: rgba(40, 40, 40, 0.95);
    backdrop-filter: blur(10px);
    padding: 20px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 101;
}

.host-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
}

.host-controls p {
    margin: 0;
    font-size: 14px;
    color: #FF0084;
}

.toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #ccc;
    margin-bottom: 5px;
    cursor: pointer;
}

.lock-btn {
    background: #333;
    border: 1px solid #444;
    color: white;
    padding: 10px 20px;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    width: 100%;
}

.lock-btn:hover {
    background: #444;
}

.lock-btn.is-locked {
    background: rgba(255, 77, 77, 0.15);
    border-color: #ff4d4d;
    color: #ff4d4d;
}

.app-main {
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
}

.host-login {
    position: absolute;
    top: 80px;
    left: 20px;
    background: rgba(40, 40, 40, 0.95);
    backdrop-filter: blur(10px);
    padding: 20px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    text-align: center;
    z-index: 101;
    min-width: 250px;
}

.host-auth-form {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.host-warn {
    color: #ffcc00;
    font-size: 13px;
    margin: 0;
}

.host-info {
    color: #ccc;
    font-size: 13px;
    margin: 0;
}

.password-input-group {
    display: flex;
    gap: 8px;
}

.password-input-group input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #555;
    background: #222;
    color: white;
}

.password-input-group button {
    background: #FF0084;
    color: black;
    border: none;
    padding: 8px 12px;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
}

.logout-btn {
    background: #e74c3c;
    border: 1px solid #c0392b;
    color: white;
    padding: 10px 20px;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    width: 100%;
    margin-top: 10px;
}

.logout-btn-sm {
    background: transparent;
    border: 1px solid #e74c3c;
    color: #e74c3c;
    padding: 5px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
}

.mt-4 { margin-top: 16px; }

.login-btn {
    background-color: #FF0084;
    color: black;
    padding: 10px 20px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: bold;
    display: inline-block;
}

.fab-search {
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 60px;
    height: 60px;
    border-radius: 30px;
    background-color: #FF0084;
    border: none;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 50;
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    animation: fabBreathe 3s infinite alternate;
}

@keyframes fabBreathe {
    0% { box-shadow: 0 4px 12px rgba(255, 0, 132, 0.3); transform: translateY(0); }
    100% { box-shadow: 0 12px 28px rgba(255, 0, 132, 0.6); transform: translateY(-4px); }
}

.fab-search:hover {
    transform: scale(1.1) translateY(-4px);
    animation-play-state: paused;
}

.fab-search:active {
    transform: scale(0.9) translateY(0);
}

.qr-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100dvh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(15px);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    box-sizing: border-box;
}

.qr-content {
    background: rgba(20, 20, 20, 0.95);
    color: white;
    border-radius: 32px;
    padding: 40px 30px;
    width: 100%;
    max-width: 380px;
    text-align: center;
    position: relative;
    border: 1px solid rgba(255, 0, 132, 0.2);
    box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 20px rgba(255, 0, 132, 0.1);
    animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.modal-close-icon {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(255,255,255,0.05);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
}

.modal-close-icon:hover {
    background: rgba(255,255,255,0.1);
}

.qr-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 800;
    background: linear-gradient(135deg, #fff 0%, #FF0084 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.qr-header p {
    color: rgba(255,255,255,0.6);
    margin: 0 0 25px 0;
    font-size: 14px;
}

.qr-code-wrapper {
    background: white;
    padding: 15px;
    border-radius: 20px;
    display: inline-block;
    margin-bottom: 25px;
    box-shadow: 0 10px 30px rgba(255, 0, 132, 0.2);
}

.qr-code-wrapper img {
    border-radius: 10px;
    display: block;
    width: 220px;
    height: 220px;
}

.url-copy-box {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 12px 16px;
    border-radius: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    margin-bottom: 25px;
    transition: all 0.2s;
}

.url-copy-box:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 0, 132, 0.3);
}

.url-copy-box:active {
    transform: scale(0.98);
}

.qr-url {
    font-weight: 600;
    color: rgba(255,255,255,0.8);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
}

.copy-icon {
    color: #FF0084;
    display: flex;
    align-items: center;
}

.close-qr-btn {
    width: 100%;
    padding: 16px;
    background: linear-gradient(135deg, #FF0084 0%, #D4006E 100%);
    color: white;
    border: none;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(255, 0, 132, 0.3);
    transition: transform 0.2s, box-shadow 0.2s;
}

.close-qr-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 0, 132, 0.4);
}

.close-qr-btn:active {
    transform: translateY(0);
}

@keyframes popIn {
    0% { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

:global(body) {
    margin: 0;
    padding: 0;
    background-color: #000;
    color: #fff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.session-closed {
    height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    background: linear-gradient(180deg, #111 0%, #000 100%);
}

.closed-content img {
    margin-bottom: 20px;
    animation: pulselogo 2s infinite ease-in-out;
}

@keyframes pulselogo {
    0% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); opacity: 0.5; }
}

.closed-content h2 { 
    font-size: 24px; 
    margin: 0 0 10px 0; 
    font-weight: 800;
}

.closed-content p { 
    color: #888; 
    margin: 0;
    font-size: 14px;
}
</style>
