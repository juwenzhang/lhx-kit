<script setup lang="ts">
defineProps<{title?: string}>();
</script>

<template>
  <section class="card">
    <header
      v-if="title"
      class="card__title"
    >
      {{ title }}
    </header>
    <div class="card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  background: #fff;
}
.card__title {
  font-weight: 600;
  margin-bottom: 8px;
}
</style>
