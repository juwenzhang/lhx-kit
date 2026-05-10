<script setup lang="ts">
defineProps<{title?: string}>();
</script>

<template>
  <section class="section">
    <header
      v-if="title"
      class="section__title"
    >
      {{ title }}
    </header>
    <div class="section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  background: #fff;
}
.section__title {
  font-weight: 600;
  margin-bottom: 8px;
}
</style>
