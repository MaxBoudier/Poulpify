<script setup>
import { ref, onMounted, defineEmits } from 'vue';

const emit = defineEmits(['registered']);
const username = ref('');
const isVisible = ref(false);
const hasAccount = ref(false);

const emojis = ['😎', '🐙', '🔥', '💃', '🚀', '⭐', '🎵', '👻', '🍕', '🐱'];
const selectedEmoji = ref(emojis[0]);

const openProfile = () => {
    username.value = localStorage.getItem('poulpify_username') || '';
    selectedEmoji.value = localStorage.getItem('poulpify_emoji') || emojis[0];
    hasAccount.value = !!localStorage.getItem('poulpify_username');
    isVisible.value = true;
};

onMounted(() => {
    const savedName = localStorage.getItem('poulpify_username');
    const savedEmoji = localStorage.getItem('poulpify_emoji') || '😎';
    if (!savedName) {
        isVisible.value = true;
    } else {
        hasAccount.value = true;
        emit('registered', { name: savedName, emoji: savedEmoji });
    }
});

const selectEmoji = (emoji) => {
    selectedEmoji.value = emoji;
};

const closeModal = () => {
    if (hasAccount.value) {
        isVisible.value = false;
    }
};

const submitName = () => {
    if (username.value.trim()) {
        localStorage.setItem('poulpify_username', username.value.trim());
        localStorage.setItem('poulpify_emoji', selectedEmoji.value);
        hasAccount.value = true;
        isVisible.value = false;
        emit('registered', { name: username.value.trim(), emoji: selectedEmoji.value });
    }
};

defineExpose({ openProfile });
</script>

<template>
    <div v-if="isVisible" class="welcome-modal" @click.self="closeModal">
        <div class="welcome-box">
            <button v-if="hasAccount" class="close-btn" @click="closeModal">×</button>
            <h2 class="title" v-if="hasAccount">Update Profile 🐙</h2>
            <h2 class="title" v-else>Join the Queue 🐙</h2>
            <p class="subtitle" v-if="hasAccount">Change your name or your emoji.</p>
            <p class="subtitle" v-else>Enter your name so everyone knows who drops the bangers.</p>
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
                <button type="submit" class="join-btn">{{ hasAccount ? 'Save Changes' : 'Let\'s Go' }}</button>
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
    position: relative;
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

.close-btn {
    position: absolute;
    top: 15px;
    right: 15px;
    background: transparent;
    border: none;
    color: #b3b3b3;
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 5px;
}

.close-btn:hover {
    color: white;
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
    background: rgba(255, 0, 132, 0.15);
    border-color: #FF0084;
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
    border-color: #FF0084;
    box-shadow: 0 0 15px rgba(255, 0, 132, 0.2);
}

.join-btn {
    width: 100%;
    padding: 15px;
    background-color: #FF0084;
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
