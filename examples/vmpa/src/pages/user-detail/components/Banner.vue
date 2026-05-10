<script setup lang="ts">
withDefaults(
  defineProps<{
    text: string;
    kind?: 'info' | 'error' | 'success';
  }>(),
  {kind: 'info'}
);
</script>

<template>
  <div
    class="banner"
    :class="`banner--${kind}`"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.banner {
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 14px;
}
.banner--info {
  background: #e6f4ff;
  color: #0958d9;
  border: 1px solid #91caff;
}
.banner--error {
  background: #fff2f0;
  color: #cf1322;
  border: 1px solid #ffccc7;
}
.banner--success {
  background: #f6ffed;
  color: #389e0d;
  border: 1px solid #b7eb8f;
}
</style>
