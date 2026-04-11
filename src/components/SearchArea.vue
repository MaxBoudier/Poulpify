<script setup>
import { ref, defineEmits } from 'vue';
import axios from 'axios';
import SongList from './SongList.vue';
import { API_BASE_URL } from '@/config';

const emit = defineEmits(['close']);

const query = ref('');
const tracks = ref([]);
const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

let searchTimeout = null;

const BackendUrl = API_BASE_URL;

const performSearch = async () => {
    if (!query.value.trim()) {
        tracks.value = [];
        return;
    }
    
    loading.value = true;
    errorMsg.value = '';
    
    try {
        const response = await axios.get(`${BackendUrl}/api/search?q=${encodeURIComponent(query.value)}`);
        tracks.value = response.data.tracks?.items || [];
    } catch (err) {
        errorMsg.value = err.response?.data?.error || 'Failed to search for tracks.';
        console.error(err);
    } finally {
        loading.value = false;
    }
};

const handleInput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 500); // debounce search
};

const addToQueue = async (uri) => {
    errorMsg.value = '';
    successMsg.value = '';
    try {
        const username = localStorage.getItem('poulpify_username') || 'Anonymous';
        await axios.post(`${BackendUrl}/api/queue`, { uri, username });
        successMsg.value = 'Track added to queue successfully!';
        setTimeout(() => {
            successMsg.value = '';
            emit('close'); // Auto-close search after successful add
        }, 1500);
    } catch (err) {
        errorMsg.value = err.response?.data?.error || 'Failed to add track to queue.';
        setTimeout(() => errorMsg.value = '', 3000);
    }
};
</script>

<template>
  <div class="search-modal">
    <div class="search-header">
        <div class="search-input-wrapper">
            <input 
                type="text" 
                v-model="query" 
                @input="handleInput" 
                placeholder="Search songs..." 
                class="search-input"
                autofocus
            />
            <svg v-if="loading" class="spinner" viewBox="0 0 50 50">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
        </div>
        <button class="close-btn" @click="emit('close')">Cancel</button>
    </div>

    <div class="search-content">
        <div v-if="errorMsg" class="message error-message">
            {{ errorMsg }}
        </div>
        
        <div v-if="successMsg" class="message success-message">
            {{ successMsg }}
        </div>

        <div class="results-container">
            <SongList :tracks="tracks" @add-to-queue="addToQueue" />
        </div>
    </div>
  </div>
</template>

<style scoped>
.search-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100dvh;
    background-color: #121212;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}

.search-header {
    display: flex;
    align-items: center;
    padding: 20px;
    background: rgba(18, 18, 18, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.05);
}

.search-input-wrapper {
    flex-grow: 1;
    position: relative;
    margin-right: 15px;
}

.search-input {
    width: 100%;
    padding: 12px 20px;
    border-radius: 20px;
    border: none;
    background-color: #242424;
    color: white;
    font-size: 16px;
    outline: none;
    box-sizing: border-box;
}

.search-input:focus {
    background-color: #2a2a2a;
    box-shadow: 0 0 0 2px #1aed5b;
}

.close-btn {
    background: transparent;
    border: none;
    color: white;
    font-weight: 500;
    font-size: 16px;
    cursor: pointer;
    white-space: nowrap;
}

.search-content {
    flex-grow: 1;
    overflow-y: auto;
    padding: 20px;
}

.spinner {
  animation: rotate 2s linear infinite;
  z-index: 2;
  position: absolute;
  top: 50%;
  right: 15px;
  margin-top: -10px;
  width: 20px;
  height: 20px;
}

.spinner .path {
  stroke: #1aed5b;
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% { transform: rotate(360deg); }
}

@keyframes dash {
  0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
  50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
}

.message {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    margin-bottom: 20px;
}

.error-message {
    background-color: rgba(226, 33, 52, 0.2);
    color: #e22134;
    border: 1px solid #e22134;
}

.success-message {
    background-color: rgba(26, 237, 91, 0.2);
    color: #1aed5b;
    border: 1px solid #1aed5b;
}
</style>
