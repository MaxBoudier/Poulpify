<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, defineProps, defineEmits } from 'vue';
import axios from 'axios';

const props = defineProps({
    track: { type: Object, default: null },
    progressMs: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

const syncedLines = ref([]);
const plainLyrics = ref('');
const lyricsLoading = ref(false);
const lyricsError = ref('');
const lastTrackId = ref('');

// Parse LRC format: [mm:ss.xx] text
const parseLRC = (lrc) => {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const parsed = [];
    
    for (const line of lines) {
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const ms = parseInt(match[3].padEnd(3, '0'));
            const timeMs = minutes * 60000 + seconds * 1000 + ms;
            const text = match[4].trim();
            if (text) {
                parsed.push({ timeMs, text });
            }
        }
    }
    
    return parsed.sort((a, b) => a.timeMs - b.timeMs);
};

const fetchLyrics = async () => {
    if (!props.track) return;
    if (lastTrackId.value === props.track.id) return;
    
    lyricsLoading.value = true;
    lyricsError.value = '';
    syncedLines.value = [];
    plainLyrics.value = '';
    
    try {
        const artist = encodeURIComponent(props.track.artists[0].name);
        const rawTitle = props.track.name.split('(')[0].split('-')[0].trim();
        const title = encodeURIComponent(rawTitle);
        
        const response = await axios.get(`https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`);
        
        if (response.data?.syncedLyrics) {
            syncedLines.value = parseLRC(response.data.syncedLyrics);
            lastTrackId.value = props.track.id;
        } else if (response.data?.plainLyrics) {
            plainLyrics.value = response.data.plainLyrics;
            lastTrackId.value = props.track.id;
        } else {
            lyricsError.value = 'No lyrics found for this track 🥲';
        }
    } catch (e) {
        lyricsError.value = 'Could not load lyrics for this song 🎤';
    } finally {
        lyricsLoading.value = false;
    }
};

// Find the currently active line index based on playback progress
const activeLineIndex = computed(() => {
    if (syncedLines.value.length === 0) return -1;
    
    let idx = -1;
    for (let i = 0; i < syncedLines.value.length; i++) {
        if (props.progressMs >= syncedLines.value[i].timeMs) {
            idx = i;
        } else {
            break;
        }
    }
    return idx;
});

const hasSyncedLyrics = computed(() => syncedLines.value.length > 0);

// Auto-scroll to active line
const lyricsContainer = ref(null);

watch(activeLineIndex, async (newIdx) => {
    if (newIdx < 0) return;
    await nextTick();
    const container = lyricsContainer.value;
    if (!container) return;
    
    const activeLine = container.querySelector('.lyric-line.active');
    if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

watch(() => props.track?.id, () => {
    fetchLyrics();
});

const progressPercent = computed(() => {
    if (!props.durationMs) return 0;
    return Math.min(100, (props.progressMs / props.durationMs) * 100);
});

const formatTime = (ms) => {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

onMounted(() => {
    fetchLyrics();
});
</script>

<template>
    <div class="karaoke-page">
        <!-- Header -->
        <div class="karaoke-header">
            <button class="back-btn" @click="emit('close')">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="karaoke-header-info">
                <p class="karaoke-label">KARAOKE <span v-if="!isPlaying" class="paused-label">(PAUSED)</span></p>
            </div>
            <div style="width: 40px;"></div>
        </div>

        <!-- Track Info Bar -->
        <div class="track-bar" v-if="track">
            <img :src="track.album?.images[2]?.url || track.album?.images[0]?.url" class="track-bar-art" />
            <div class="track-bar-info">
                <p class="track-bar-title">{{ track.name }}</p>
                <p class="track-bar-artist">{{ track.artists?.map(a => a.name).join(', ') }}</p>
            </div>
        </div>

        <!-- Lyrics Body -->
        <div class="karaoke-body" ref="lyricsContainer">
            <!-- Loading -->
            <div v-if="lyricsLoading" class="karaoke-status">
                <div class="loading-pulse"></div>
                <p>Finding lyrics...</p>
            </div>

            <!-- Error -->
            <div v-else-if="lyricsError" class="karaoke-status">
                <p>{{ lyricsError }}</p>
            </div>

            <!-- Synced Lyrics -->
            <div v-else-if="hasSyncedLyrics" class="synced-lyrics">
                <div class="lyrics-spacer"></div>
                <p 
                    v-for="(line, i) in syncedLines" 
                    :key="i"
                    class="lyric-line"
                    :class="{ 
                        'active': i === activeLineIndex, 
                        'past': i < activeLineIndex,
                        'future': i > activeLineIndex
                    }"
                >
                    {{ line.text }}
                </p>
                <div class="lyrics-spacer"></div>
            </div>

            <!-- Plain Lyrics Fallback -->
            <div v-else-if="plainLyrics" class="plain-lyrics-fallback">
                <p class="fallback-notice">⚡ Synced lyrics unavailable — showing static lyrics</p>
                <pre class="plain-text">{{ plainLyrics }}</pre>
            </div>
        </div>

        <!-- Bottom Progress -->
        <div class="karaoke-footer" v-if="track">
            <div class="karaoke-time-labels">
                <span>{{ formatTime(progressMs) }}</span>
                <span>{{ formatTime(durationMs) }}</span>
            </div>
            <div class="karaoke-progress-bg">
                <div class="karaoke-progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.karaoke-page {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100dvh;
    background: linear-gradient(180deg, #0a0a0a 0%, #1a0a2e 40%, #0d1f11 100%);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Header */
.karaoke-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    flex-shrink: 0;
}

.back-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s;
}

.back-btn:active {
    transform: scale(0.9);
}

.karaoke-header-info {
    text-align: center;
}

.karaoke-label {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 3px;
    color: #1aed5b;
    text-transform: uppercase;
}

.paused-label {
    color: #ff4d4d;
    margin-left: 5px;
    letter-spacing: normal;
}

/* Track Bar */
.track-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px 15px 20px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

.track-bar-art {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
}

.track-bar-info {
    overflow: hidden;
}

.track-bar-title {
    margin: 0;
    color: white;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.track-bar-artist {
    margin: 2px 0 0 0;
    color: rgba(255,255,255,0.5);
    font-size: 13px;
}

/* Lyrics Body */
.karaoke-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    scroll-behavior: smooth;
    -webkit-mask-image: linear-gradient(transparent 0%, black 15%, black 85%, transparent 100%);
    mask-image: linear-gradient(transparent 0%, black 15%, black 85%, transparent 100%);
}

.karaoke-status {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: rgba(255,255,255,0.5);
    font-size: 18px;
    gap: 20px;
}

.loading-pulse {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #1aed5b;
    animation: pulse 1.5s ease infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.3); opacity: 1; }
}

/* Synced lyrics */
.synced-lyrics {
    text-align: center;
    padding: 10px 0;
}

.lyrics-spacer {
    height: 35vh;
}

.lyric-line {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.5;
    padding: 10px 5px;
    margin: 0;
    transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    border-radius: 8px;
}

.lyric-line.future {
    color: rgba(255, 255, 255, 0.2);
}

.lyric-line.past {
    color: rgba(255, 255, 255, 0.35);
}

.lyric-line.active {
    color: #1aed5b;
    text-shadow: 0 0 30px rgba(26, 237, 91, 0.4);
}

/* Plain lyrics fallback */
.plain-lyrics-fallback {
    text-align: center;
}

.fallback-notice {
    color: rgba(255,255,255,0.4);
    font-size: 13px;
    margin-bottom: 20px;
}

.plain-text {
    color: rgba(255,255,255,0.6);
    font-size: 18px;
    font-weight: 500;
    line-height: 1.8;
    white-space: pre-wrap;
    font-family: inherit;
    margin: 0;
}

/* Footer Progress */
.karaoke-footer {
    flex-shrink: 0;
    padding: 15px 20px 30px 20px;
    border-top: 1px solid rgba(255,255,255,0.06);
}

.karaoke-time-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    font-variant-numeric: tabular-nums;
    margin-bottom: 6px;
}

.karaoke-progress-bg {
    width: 100%;
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
}

.karaoke-progress-fill {
    height: 100%;
    background: #1aed5b;
    border-radius: 2px;
    transition: width 1s linear;
}
</style>
