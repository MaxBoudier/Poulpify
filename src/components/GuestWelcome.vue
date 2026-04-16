<script setup>
import { ref, onMounted, defineEmits } from 'vue';

const emit = defineEmits(['registered']);
const username = ref('');
const isVisible = ref(false);
const hasAccount = ref(false);

const emojis = ['🐙', '🔥', '⭐', '🎵', '🚀', '✨', '🎉', '🍕', '🐱'];
const selectedEmoji = ref(emojis[0]);
const isPickerOpen = ref(false);
const currentCategory = ref('Visages');

const emojiCategories = {
    "Visages": ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🥳', '😏', '🤡', '💩', '👻', '👽', '👾', '🤖'],
    "Animaux": ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐣', '🐧', '🐦', '🐤', '🦇', '🦋', '🐌', '🐞', '🐜', '🕷️', '🐢', '🐍', '🦎', '🦖', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡'],
    "Nourriture": ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞', '🍕', '🍔', '🍟', '🌮', '🌯', '🥘', '🍲', '🥣'],
    "Activités": ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '🎸', '🎺', '🎻', '🎮', '🕹️', '🎨'],
    "Objets": ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🕹️', '🪗', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '⏳', '⌛']
};

const selectEmoji = (emoji) => {
    selectedEmoji.value = emoji;
    isPickerOpen.value = false;
};

const togglePicker = () => {
    isPickerOpen.value = !isPickerOpen.value;
};

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
        selectedEmoji.value = savedEmoji;
        emit('registered', { name: savedName, emoji: savedEmoji });
    }
});


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
            <h2 class="title" v-if="hasAccount">Modifier le profil 🐙</h2>
            <h2 class="title" v-else>Rejoindre la file 🐙</h2>
            <p class="subtitle" v-if="hasAccount">Modifie ton pseudo ou ton emoji.</p>
            <p class="subtitle" v-else>Entre ton nom pour que tout le monde sache qui envoie les pépites.</p>
            <form @submit.prevent="submitName" class="name-form">
                <div class="emoji-section">
                    <p class="section-label">Ton Vibe</p>
                    <div class="emoji-grid">
                        <button 
                            v-for="emoji in emojis" 
                            :key="emoji" 
                            type="button"
                            class="emoji-btn favorite"
                            :class="{ 'is-selected': selectedEmoji === emoji }"
                            @click="selectEmoji(emoji)"
                        >
                            {{ emoji }}
                        </button>
                        <button type="button" class="emoji-btn more-btn" @click="togglePicker" :class="{ 'is-active': isPickerOpen }">
                            <span>+</span>
                        </button>
                    </div>
                </div>

                <!-- FULL EMOJI PICKER OVERLAY -->
                <Transition name="slide-up">
                    <div v-if="isPickerOpen" class="full-picker">
                        <div class="picker-header">
                            <div class="picker-tabs">
                                <button 
                                    v-for="(list, cat) in emojiCategories" 
                                    :key="cat"
                                    type="button"
                                    class="tab-btn"
                                    :class="{ 'active': currentCategory === cat }"
                                    @click="currentCategory = cat"
                                >
                                    {{ list[0] }}
                                </button>
                            </div>
                            <button type="button" class="close-picker" @click="isPickerOpen = false">Terminé</button>
                        </div>
                        <div class="picker-content">
                            <p class="cat-title">{{ currentCategory }}</p>
                            <div class="all-emojis-grid">
                                <button 
                                    v-for="emoji in emojiCategories[currentCategory]" 
                                    :key="emoji"
                                    type="button"
                                    class="grid-emoji-btn"
                                    :class="{ 'is-selected': selectedEmoji === emoji }"
                                    @click="selectEmoji(emoji)"
                                >
                                    {{ emoji }}
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
                
                <div class="input-section">
                    <p class="section-label">Pseudo</p>
                    <input 
                        type="text" 
                        v-model="username" 
                        placeholder="Ton nom..." 
                        required 
                        autofocus 
                        class="name-input"
                    />
                </div>
                <button type="submit" class="join-btn">{{ hasAccount ? 'Sauvegarder' : 'C\'est parti !' }}</button>
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

.emoji-section, .input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}

.section-label {
    color: #888;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-left: 5px;
}

.emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    margin-bottom: 20px;
}

.more-btn {
    background: #121212;
    border: 2px dashed #444;
    color: #888;
    font-size: 20px;
}

.more-btn.is-active {
    border-color: #FF0084;
    background: rgba(255, 0, 132, 0.1);
    color: #FF0084;
}

/* Picker Overlay */
.full-picker {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 380px;
    background: #1e1e1e;
    border-top: 2px solid #333;
    border-radius: 24px 24px 0 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
}

.picker-header {
    padding: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #333;
}

.picker-tabs {
    display: flex;
    gap: 5px;
}

.tab-btn {
    background: transparent;
    border: none;
    font-size: 22px;
    padding: 5px;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.2s;
}

.tab-btn.active {
    background: rgba(255, 255, 255, 0.1);
}

.close-picker {
    background: #FF0084;
    color: black;
    border: none;
    padding: 6px 15px;
    border-radius: 20px;
    font-weight: bold;
    font-size: 13px;
    cursor: pointer;
}

.picker-content {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
}

.cat-title {
    color: #888;
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 12px;
    text-transform: uppercase;
}

.all-emojis-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
}

.grid-emoji-btn {
    background: transparent;
    border: 2px solid transparent;
    border-radius: 12px;
    font-size: 26px;
    padding: 5px;
    cursor: pointer;
    transition: all 0.2s;
}

.grid-emoji-btn:hover {
    background: rgba(255, 255, 255, 0.05);
}

.grid-emoji-btn.is-selected {
    background: rgba(255, 0, 132, 0.1);
    border-color: #FF0084;
}

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
    transform: translateY(100%);
    opacity: 0;
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
