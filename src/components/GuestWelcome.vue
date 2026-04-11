<script setup>
import { ref, onMounted, defineEmits } from 'vue';

const emit = defineEmits(['registered']);
const username = ref('');
const isVisible = ref(false);

const emojis = ['😎', '🐙', '🔥', '💃', '🚀', '⭐', '🎵', '👻', '🍕', '🐱'];
const selectedEmoji = ref(emojis[0]);

onMounted(() => {
    const savedName = localStorage.getItem('poulpify_username');
    const savedEmoji = localStorage.getItem('poulpify_emoji') || '😎';
    if (!savedName) {
        isVisible.value = true;
    } else {
        emit('registered', { name: savedName, emoji: savedEmoji });
    }
});

const selectEmoji = (emoji) => {
    selectedEmoji.value = emoji;
};

const submitName = () => {
    if (username.value.trim()) {
        localStorage.setItem('poulpify_username', username.value.trim());
        localStorage.setItem('poulpify_emoji', selectedEmoji.value);
        isVisible.value = false;
        emit('registered', { name: username.value.trim(), emoji: selectedEmoji.value });
    }
};
</script>

<template>
    <div v-if="isVisible" class="welcome-modal">
        <div class="welcome-box">
            <h2 class="title">Join the Queue 🐙</h2>
            <p class="subtitle">Enter your name so everyone knows who drops the bangers.</p>
            <form @submit.prevent="submitName" class="name-form">
                <div class="emoji-picker">
                    <button 
                        v-for="emoji in emojis" 
                        :key="emoji" 
                        type="button"
                        class="emoji-btn"
                        :class="{ 'is-selected': selectedEmoji === emoji }"
                        @click="selectEmoji(emoji)"
                    >
                        {{ emoji }}
                    </button>
                </div>
                <input 
                    type="text" 
                    v-model="username" 
                    placeholder="Your name..." 
                    required 
                    autofocus 
                    class="name-input"
                />
                <button type="submit" class="join-btn">Let's Go</button>
            </form>
        </div>
    </div>
</template>

<style scoped>
.welcome-modal {
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

.welcome-box {
    background: rgba(40, 40, 40, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    border-radius: 24px;
    padding: 40px 30px;
    width: 100%;
    max-width: 400px;
    text-align: center;
    animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
    0% { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}

.title {
    color: white;
    font-size: 28px;
    font-weight: 800;
    margin: 0 0 10px 0;
}

.subtitle {
    color: #b3b3b3;
    font-size: 15px;
    margin: 0 0 30px 0;
    line-height: 1.4;
}

.name-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.emoji-picker {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 5px;
}

.emoji-btn {
    background: #242424;
    border: 2px solid transparent;
    border-radius: 12px;
    font-size: 22px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
}

.emoji-btn:hover {
    background: #333;
    transform: scale(1.1);
}

.emoji-btn.is-selected {
    background: rgba(26, 237, 91, 0.15);
    border-color: #1aed5b;
    transform: scale(1.1);
}

.name-input {
    width: 100%;
    padding: 15px 20px;
    background: #121212;
    border: 2px solid transparent;
    border-radius: 12px;
    color: white;
    font-size: 18px;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
    text-align: center;
}

.name-input:focus {
    border-color: #1aed5b;
    box-shadow: 0 0 15px rgba(26, 237, 91, 0.2);
}

.join-btn {
    width: 100%;
    padding: 15px;
    background-color: #1aed5b;
    color: black;
    border: none;
    border-radius: 12px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.2s, background-color 0.2s;
}

.join-btn:active {
    transform: scale(0.95);
}
</style>
