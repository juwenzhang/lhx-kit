<script setup lang="ts">
import {Button as TButton} from 'tdesign-mobile-vue';

withDefaults(
  defineProps<{
    text: string;
    kind?: 'primary' | 'danger' | 'default';
    loading?: boolean;
  }>(),
  {kind: 'default', loading: false}
);

/**
 * Vue treats parent-bound `onClick` as the `click` listener automatically,
 * so we only need to forward our internal click out via `emits`. The renderer
 * binding at packages/renderer/src/vue.ts:170 generates `onClick: () => dispatch(...)`
 * — that prop becomes a click listener on this component without any glue.
 */
const emit = defineEmits<{click: []}>();

function onClick(): void {
  emit('click');
}
</script>

<template>
  <TButton
    :theme="kind === 'primary' ? 'primary' : kind === 'danger' ? 'danger' : 'default'"
    :loading="loading"
    size="medium"
    class="action-btn"
    @click="onClick"
  >
    {{ text }}
  </TButton>
</template>

<style scoped>
.action-btn {
  margin-right: 8px;
}
</style>
