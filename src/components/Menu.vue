<script setup>

</script>

<template>
  <div>
    <ul>
      <li style="display: inline">
        <button>
          <img src="../assets/images/music_icon.png" height="50" width="50"/>
        </button>
      </li>
      <li style="display: inline">
        <button>
          <img src="../assets/images/magnifying_glass.png" height="50" width="50"/>
        </button>
      </li>
      <li style="display: inline">
        <button>
          <img src="../assets/images/playlist.png" height="50" width="50"/>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
div{
  margin-top: 0.5em;
  margin-left: 0.5em;
  display: flex;
  width: auto;
  height: 5em;
  justify-content: center;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}
ul{
  background-color: #1f1f1f;
  display: flex;
  gap: 20px;
  width: fit-content;
  padding: 10px;
  border-radius: 10px;
}

button{
  background-color: transparent;
  border: none;
  cursor: pointer;
  outline: none;
}

img{
  filter: invert(45%);
}
</style>