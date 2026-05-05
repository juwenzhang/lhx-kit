import {createPinia} from 'pinia';
import {createApp, defineComponent, h} from 'vue';
import {RouterView} from 'vue-router';
import {bootstrap} from '@/bootstrap';
import {createHomeRouter} from './router';

/**
 * Shell component for the `home` MPA entry. It simply hosts
 * <router-view/>; actual content lives in ./views/*.vue.
 */
const HomeShell = defineComponent({
  name: 'HomeShell',
  setup() {
    return () => h(RouterView);
  }
});

void bootstrap().then(() => {
  createApp(HomeShell).use(createPinia()).use(createHomeRouter()).mount('#app');
});
