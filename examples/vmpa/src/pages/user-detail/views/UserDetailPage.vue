<script setup lang="ts">
import {computed, onMounted, watch} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {Toast} from 'tdesign-mobile-vue';
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '../render.json';
import ActionButton from '../components/ActionButton.vue';
import Banner from '../components/Banner.vue';
import FormField from '../components/FormField.vue';
import Section from '../components/Section.vue';
import {useUserDetailStore} from '@/stores/user-detail';

const registry = createRegistry();
registry.registerAll({
  Section: () => Section,
  Banner: () => Banner,
  FormField: () => FormField,
  ActionButton: () => ActionButton
});

/**
 * Action middleware gap: the renderer dispatches `(payload, ctx)` straight to
 * the registered handler with no interceptor chain. AOP concerns (tracking,
 * audit, error trap, perf) must be wrapped manually at registration time.
 */
function withTracking<TArgs extends unknown[], TRet>(
  name: string,
  fn: (...args: TArgs) => TRet
): (...args: TArgs) => TRet {
  return (...args) => {
    // eslint-disable-next-line no-console
    console.log(`[track] action=${name}`, args[0] ?? null);
    return fn(...args);
  };
}

const route = useRoute();
const router = useRouter();
const store = useUserDetailStore();

/**
 * Route param gap: the schema cannot reach `route.params.id` — there is no
 * `route` root in the renderer's expression lookup. Host extracts it manually.
 */
const userId = computed(() => (route.params.id as string) ?? 'u-001');
const role = computed(() =>
  (route.query.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user'
);

/**
 * Network gap: the renderer has no lifecycle hooks. The host runs the fetch
 * in onMounted/watch and updates store; the schema only sees the result.
 */
onMounted(() => {
  void store.fetchUser(userId.value);
});
watch(userId, id => {
  void store.fetchUser(id);
});

/**
 * State-snapshot gap: `createConfiguredPage` calls `ref({...options.state})`
 * once at mount (vue.ts:70). To push fresh state we recreate the factory on
 * every store mutation — `store.version` increments each time. Each version
 * change ⇒ new component identity ⇒ full remount ⇒ registry resolution rerun.
 */
const Page = computed(() => {
  // Touching store.version here makes this computed reactive to every mutation.
  void store.version;
  return createConfiguredPage({
    schema: schema as never,
    registry: registry as never,
    state: {
      title: store.user.id
        ? `用户：${store.user.name ?? '未命名'} (${store.user.id})`
        : '用户详情',
      user: store.user,
      loading: store.loading,
      saving: store.saving,
      error: store.error
    },
    flags: {role: role.value, userId: userId.value},
    actions: {
      saveUser: withTracking('saveUser', async () => {
        const r = await store.saveUser();
        Toast({theme: r.ok ? 'success' : 'error', message: r.message, direction: 'column'});
      }),
      deleteUser: withTracking('deleteUser', async () => {
        const r = await store.deleteUser();
        if (r.ok) {
          Toast({theme: 'success', message: r.message, direction: 'column'});
          await router.push('/');
        } else {
          Toast({theme: 'error', message: r.message, direction: 'column'});
        }
      })
    }
  });
});
</script>

<template>
  <div class="user-detail">
    <header class="user-detail__hint">
      <router-link to="/">
        ← 回首页
      </router-link>
      <span class="user-detail__hint-text">
        提示: URL 加 <code>?role=admin</code> 显示删除按钮; 试 <code>#/user/u-002</code> 切用户; <code>#/user/missing</code> 触发错误态。
      </span>
    </header>
    <component :is="Page" />
  </div>
</template>

<style scoped>
.user-detail {
  max-width: 520px;
  margin: 24px auto;
  padding: 0 16px;
}
.user-detail__hint {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.user-detail__hint-text {
  color: #888;
  font-size: 12px;
}
</style>
