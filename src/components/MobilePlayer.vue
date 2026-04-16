<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import axios from 'axios';
import KaraokeView from './KaraokeView.vue';
import { API_BASE_URL } from '@/config';

const BackendUrl = API_BASE_URL;
const currentlyPlaying = ref(null);
const queue = ref([]);
const progressMs = ref(0);
const durationMs = ref(0);
const isPlaying = ref(false);

const showKaraoke = ref(false);

const connectedUsers = ref([]);
const skipVotesCount = ref(0);
const requiredVotesCount = ref(1);
const iHaveVoted = ref(false);

let pollingInterval = null;
let heartbeatInterval = null;
let progressTickInterval = null;

const fetchState = async () => {
    try {
        const [playerRes, queueRes] = await Promise.all([
            axios.get(`${BackendUrl}/api/player`),
            axios.get(`${BackendUrl}/api/player-queue`)
        ]);
        
        if (playerRes.data && playerRes.data.item) {
            currentlyPlaying.value = playerRes.data.item;
            progressMs.value = playerRes.data.progress_ms;
            durationMs.value = playerRes.data.item.duration_ms;
            isPlaying.value = playerRes.data.is_playing;
        } else if (queueRes.data && queueRes.data.currently_playing) {
            // Fallback if /api/player returns 204 or lacks data
            currentlyPlaying.value = queueRes.data.currently_playing;
            progressMs.value = 0;
            durationMs.value = queueRes.data.currently_playing.duration_ms || 100000;
            isPlaying.value = true;
        } else {
            currentlyPlaying.value = null;
        }
        
        if (queueRes.data && queueRes.data.queue) {
            queue.value = queueRes.data.queue;
        }
    } catch (err) {
        console.error('Failed to fetch player architecture state', err);
    }
};

const submitHeartbeat = async () => {
    const username = localStorage.getItem('poulpify_username');
    const emoji = localStorage.getItem('poulpify_emoji');
    const hostToken = localStorage.getItem('poulpify_host_token');
    try {
        const res = await axios.post(`${BackendUrl}/api/heartbeat`, { username, emoji, hostToken });
        connectedUsers.value = res.data.activeUsers;
        skipVotesCount.value = res.data.skipVotes;
        requiredVotesCount.value = res.data.requiredVotes;
        iHaveVoted.value = res.data.hasVoted;
    } catch (e) {
        // ignore silently
    }
};

const castSkipVote = async () => {
    const username = localStorage.getItem('poulpify_username');
    if (!username) return alert('Register your name first to vote!');
    if (iHaveVoted.value) return;
    try {
        const res = await axios.post(`${BackendUrl}/api/vote-skip`, { username });
        if(res.data.success) {
            skipVotesCount.value = res.data.skipVotes;
            requiredVotesCount.value = res.data.requiredVotes;
            iHaveVoted.value = true;
        }
    } catch(e) {
        alert('Could not cast vote... :(');
    }
};

const tickProgress = () => {
    if (isPlaying.value && currentlyPlaying.value) {
        progressMs.value += 1000;
        if (progressMs.value >= durationMs.value) {
            progressMs.value = durationMs.value;
            // Optionally, trigger a fetch sooner if track ended
        }
    }
};

const formatTime = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const progressPercent = computed(() => {
    if (!durationMs.value) return 0;
    return Math.min(100, (progressMs.value / durationMs.value) * 100);
});

onMounted(() => {
    fetchState();
    submitHeartbeat();
    pollingInterval = setInterval(fetchState, 5000); // Poll every 5s to sync
    heartbeatInterval = setInterval(submitHeartbeat, 5000); // Heartbeat every 5s
    progressTickInterval = setInterval(tickProgress, 1000); // Local tick every 1s
});

onUnmounted(() => {
    clearInterval(pollingInterval);
    clearInterval(heartbeatInterval);
    clearInterval(progressTickInterval);
});
</script>

<template>
  <div class="mobile-layout">
    
    <!-- Page 1: Player -->
    <section class="player-view snap-page">
        <div v-if="!currentlyPlaying" class="empty-state">
           <h2>No active playback.</h2>
           <p>Play a song on Spotify to wake up the app!</p>
        </div>
        
        <div v-else class="player-content">
            <div class="album-art-wrapper" :class="{ 'is-paused-art': !isPlaying }">
                <img :src="currentlyPlaying.album?.images[0]?.url" class="album-art glow-fx" />
                <div v-if="!isPlaying" class="pause-overlay">
                    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </div>
            </div>
            
            <div class="song-info">
                <div class="title-row">
                    <h1 class="title">{{ currentlyPlaying.name }}</h1>
                    <div class="action-buttons">
                        <button class="skip-btn" :class="{ 'voted': iHaveVoted }" @click="castSkipVote">
                            ⏭️ {{ skipVotesCount }}/{{ requiredVotesCount }}
                        </button>
                        <button class="lyrics-btn" @click="showKaraoke = true">
                            🎤
                        </button>
                    </div>
                </div>
                <h2 class="artist">
                    <span v-if="currentlyPlaying.addedViaPoulpify" class="poulpify-badge">{{ currentlyPlaying.addedBy }}</span>
                    {{ currentlyPlaying.artists?.map(a => a.name).join(', ') }}
                </h2>
            </div>
            
            <div class="progress-container">
                <div class="time-labels">
                    <span>{{ formatTime(progressMs) }}</span>
                    <span>-{{ formatTime(durationMs - progressMs) }}</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
                </div>
            </div>

            <div class="scroll-down-hint">
                <p>Slide down for Queue</p>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
        </div>
    </section>

    <!-- Page 2: Queue -->
    <section class="queue-view snap-page">
        <!-- Active Users Panel -->
        <div class="active-users-panel">
            <h3 class="panel-subtitle">Connectés</h3>
            <div class="users-scroll">
                <div class="user-bubble" v-for="user in connectedUsers" :key="user.name">
                    <span class="user-emoji">{{ user.emoji }}</span>
                    <span class="user-name-small">{{ user.name }}</span>
                </div>
                <div v-if="connectedUsers.length === 0" class="no-users-label">Personne ??</div>
            </div>
        </div>

        <h2 class="queue-header">Up Next</h2>
        <div v-if="queue.length === 0" class="empty-queue">
            Your queue is totally empty! Use search to add some tunes.
        </div>
        
        <TransitionGroup name="list" tag="ul" class="queue-list" v-else>
            <li v-for="(track, index) in queue" :key="track.id + '-' + index" class="queue-item">
                <img :src="track.album?.images[2]?.url || track.album?.images[0]?.url" class="queue-art" />
                <div class="queue-track-info">
                    <p class="queue-title">{{ track.name }}</p>
                    <p class="queue-artist">
                        <span v-if="track.addedViaPoulpify" class="poulpify-badge">{{ track.addedBy }}</span>
                        {{ track.artists?.map(a => a.name).join(', ') }}
                    </p>
                </div>
            </li>
        </TransitionGroup>
        <div class="spacer-bottom"></div>
    </section>
    
  </div>

  <!-- Karaoke Full Screen -->
  <KaraokeView 
      v-if="showKaraoke" 
      :track="currentlyPlaying" 
      :progressMs="progressMs"
      :durationMs="durationMs"
      :isPlaying="isPlaying"
      @close="showKaraoke = false" 
  />
</template>

<style scoped>
.mobile-layout {
    height: 100dvh;
    width: 100vw;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
    background: linear-gradient(-45deg, #0a0a0a, #1a1a1a, #240a16, #0a0a0a);
    background-size: 400% 400%;
    animation: gradientBG 15s ease infinite;
}

@keyframes gradientBG {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

.snap-page {
    scroll-snap-align: start;
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
}

/* --- Player View --- */
.player-view {
    padding: 40px 30px;
    justify-content: center;
    position: relative;
}

.player-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.album-art-wrapper {
    width: 100%;
    max-width: 350px;
    aspect-ratio: 1 / 1;
    margin-bottom: 40px;
    position: relative;
    border-radius: 20px;
    transition: transform 0.3s ease;
}

.is-paused-art {
    transform: scale(0.95);
    filter: grayscale(0.5);
}

.pause-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0,0,0,0.3);
    border-radius: 20px;
    z-index: 3;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.album-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 20px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    z-index: 2;
    position: relative;
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.album-art-wrapper:hover .album-art {
    transform: scale(1.02);
}

.glow-fx {
    box-shadow: 0 30px 60px rgba(255, 0, 132, 0.15), 0 20px 40px rgba(0,0,0,0.8);
}

.song-info {
    width: 100%;
    text-align: left;
    margin-bottom: 30px;
}

.title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 8px;
}

.title {
    font-size: 28px;
    font-weight: 800;
    color: white;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
}

.action-buttons {
    display: flex;
    gap: 10px;
    align-items: center;
}

.skip-btn {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 20px;
    padding: 8px 12px;
    font-size: 14px;
    color: white;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}

.skip-btn:hover {
    background: rgba(255,255,255,0.2);
    transform: scale(1.05);
}

.skip-btn.voted {
    background: rgba(255, 0, 132, 0.2);
    border-color: #FF0084;
    color: #FF0084;
}

.lyrics-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 18px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
}

.artist {
    font-size: 18px;
    font-weight: 400;
    color: #b3b3b3;
    margin: 0;
}

.progress-container {
    width: 100%;
    margin-bottom: 40px;
}

.time-labels {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #b3b3b3;
    font-variant-numeric: tabular-nums;
    margin-bottom: 8px;
}

.progress-bar-bg {
    width: 100%;
    height: 6px;
    background-color: rgba(255,255,255,0.1);
    border-radius: 3px;
    position: relative;
    cursor: pointer;
}

.progress-bar-fill {
    height: 100%;
    background-color: #FF0084;
    border-radius: 3px;
    transition: width 1s linear;
    position: relative;
}

.progress-bar-fill::after {
    content: '';
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%) scale(0);
    width: 12px;
    height: 12px;
    background-color: #fff;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.progress-container:hover .progress-bar-fill::after,
.progress-container:active .progress-bar-fill::after {
    transform: translateY(-50%) scale(1);
}

.scroll-down-hint {
    position: absolute;
    bottom: 30px;
    color: rgba(255,255,255,0.4);
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 12px;
    animation: bounce 2s infinite;
}

@keyframes bounce {
    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-10px); }
    60% { transform: translateY(-5px); }
}

/* --- Queue View --- */
.queue-view {
    padding: 100px 20px 100px 20px; /* top padding for header overlap, bottom for FAB */
    background-color: #121212;
}

.active-users-panel {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 16px;
    padding: 15px;
    margin-bottom: 30px;
}

.panel-subtitle {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
}

.users-scroll {
    display: flex;
    gap: 15px;
    overflow-x: auto;
    padding-bottom: 5px;
    scrollbar-width: none; /* Firefox */
}
.users-scroll::-webkit-scrollbar {
    display: none; /* Chrome */
}

.user-bubble {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 50px;
}

.user-emoji {
    font-size: 24px;
    background: rgba(255, 255, 255, 0.1);
    width: 46px;
    height: 46px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 23px;
    margin-bottom: 6px;
    border: 1px solid rgba(255, 255, 255, 0.15);
}

.user-name-small {
    font-size: 11px;
    color: #ccc;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 60px;
    text-align: center;
}

.no-users-label {
    font-size: 13px;
    color: #555;
    font-style: italic;
    padding: 10px 0;
}

.queue-header {
    font-size: 24px;
    color: white;
    margin-bottom: 20px;
    padding-left: 10px;
}

.empty-queue, .empty-state {
    color: #b3b3b3;
    text-align: center;
    padding: 50px 20px;
}

.queue-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.list-enter-active,
.list-leave-active {
    transition: all 0.4s ease;
}
.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

.queue-item {
    display: flex;
    align-items: center;
    padding: 10px;
    border-radius: 12px;
    transition: background-color 0.2s, transform 0.2s;
}

.queue-item:hover {
    background-color: rgba(255,255,255,0.05);
    transform: translateX(4px);
}

.queue-art {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    margin-right: 15px;
}

.queue-track-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.queue-title {
    color: white;
    font-size: 16px;
    font-weight: 500;
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.queue-artist {
    color: #b3b3b3;
    font-size: 14px;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
}

.poulpify-badge {
    background-color: rgba(255, 0, 132, 0.15);
    color: #FF0084;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    margin-right: 8px;
    letter-spacing: 0.5px;
}

.spacer-bottom {
    height: 100px;
}
</style>
