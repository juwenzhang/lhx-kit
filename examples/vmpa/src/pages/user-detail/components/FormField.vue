<script setup lang="ts">
import {Input as TInput} from 'tdesign-mobile-vue';
import {useUserDetailStore, type UserDetail} from '@/stores/user-detail';

const props = defineProps<{
  label: string;
  field: keyof UserDetail;
  value?: string;
}>();

/**
 * The renderer's `events` binding drops event arguments — `() => dispatch(...)`
 * at packages/renderer/src/vue.ts:170 ignores anything the input emits. To get
 * a typed `(field, value)` mutation flow, this component reaches into the
 * pinia store directly, completely bypassing the schema's events DSL.
 *
 * That bypass is the gap: a renderer expressive enough to declare two-way
 * binding would let the schema do this. Today it cannot.
 */
const store = useUserDetailStore();

function onChange(next: string | number): void {
  store.setField(props.field, String(next));
}
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <TInput
      :value="value ?? ''"
      :placeholder="`请输入${label}`"
      borderless
      class="field__input"
      @change="onChange"
    />
  </label>
</template>

<style scoped>
.field {
  display: flex;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}
.field__label {
  width: 80px;
  flex-shrink: 0;
  font-size: 14px;
  color: #555;
}
.field__input {
  flex: 1;
}
</style>
