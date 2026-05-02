<script setup lang="ts">
const props = defineProps<{level?: number; text?: string}>();
</script>

<template>
  <h1 v-if="(props.level ?? 1) === 1">{{ props.text }}</h1>
  <h2 v-else-if="props.level === 2">{{ props.text }}</h2>
  <h3 v-else>{{ props.text }}</h3>
</template>
