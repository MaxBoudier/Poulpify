<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  tracks: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['add-to-queue']);

const addTrack = (uri, isInked = false) => {
  emit('add-to-queue', { uri, isInked });
};
</script>

<template>
  <div class="song-list-container">
    <div v-if="tracks.length === 0" class="no-results">
        <p>No tracks found.</p>
    </div>
    <TransitionGroup name="list" tag="ul" class="song-list" v-else>
      <li v-for="track in tracks" :key="track.id" class="song-item">
        <img :src="track.album.images[2]?.url || track.album.images[0]?.url" alt="Album Art" class="album-art" />
        <div class="song-info">
          <p class="song-name">{{ track.name }}</p>
          <p class="song-artist">{{ track.artists.map(a => a.name).join(', ') }}</p>
        </div>
        <button class="ink-button" @click="addTrack(track.uri, true)" title="Ajouter en mode Encre du Poulpe 🐙">
          🐙
        </button>
        <button class="add-button" @click="addTrack(track.uri, false)">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.song-list-container {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
}

.no-results {
    text-align: center;
    color: #b3b3b3;
    padding: 2em;
}

.song-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(15px);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  transition: background-color 0.2s, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.song-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  transform: scale(1.02);
}

.album-art {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  margin-right: 15px;
}

.song-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.song-name {
  margin: 0;
  color: white;
  font-weight: 500;
  font-size: 16px;
}

.song-artist {
  margin: 4px 0 0;
  color: #b3b3b3;
  font-size: 14px;
}

.add-button {
  background: transparent;
  border: none;
  color: #FF0084;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: transform 0.1s, background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-button:hover {
  background-color: rgba(255, 0, 132, 0.1);
  transform: scale(1.1);
}

.add-button:active {
    transform: scale(0.9);
}

.ink-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  opacity: 0.4;
}

.ink-button:hover {
  background-color: rgba(255, 0, 132, 0.1);
  transform: scale(1.2);
  opacity: 1;
}

.ink-button:active {
  transform: scale(0.9);
}
</style>
