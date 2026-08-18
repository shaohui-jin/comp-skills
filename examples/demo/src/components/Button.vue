<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <button class="btn">{{ label }}</button>
</template>

<style scoped>
.btn { padding: 4px 10px; background: #409eff; color: #fff; border: none; border-radius: 4px; }
</style>
