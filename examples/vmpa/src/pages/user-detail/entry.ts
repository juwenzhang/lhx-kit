import {createApp, defineComponent, h} from 'vue';
import {createPinia} from 'pinia';
import {RouterView} from 'vue-router';
import {createUserDetailRouter} from './router';
import {bootstrap} from '@/bootstrap';

const Shell = defineComponent({
  name: 'UserDetailShell',
  setup() {
    return () => h(RouterView);
  }
});

void bootstrap().then(() => {
  createApp(Shell)
    .use(createPinia())
    .use(createUserDetailRouter())
    .mount('#app');
});
