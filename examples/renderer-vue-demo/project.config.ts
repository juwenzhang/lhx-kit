import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'renderer-vue-demo',
  framework: 'vue3',
  envs: {
    dev: {apiBase: '/api'},
    prod: {apiBase: 'https://api.example.com'}
  },
  pages: {
    home: {title: 'Renderer demo - Home'},
    profile: {title: 'Renderer demo - Profile'}
  }
});
