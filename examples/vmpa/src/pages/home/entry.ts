import {createApp, defineComponent, h} from 'vue';
import {createPinia} from 'pinia';
import {RouterView} from 'vue-router';
import {createHomeRouter} from './router';
import {bootstrap} from '@/bootstrap';

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
  createApp(HomeShell)
    .use(createPinia())
    .use(createHomeRouter())
    .mount('#app');
});
