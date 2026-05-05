import {createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router';

/**
 * Router scoped to the "home" MPA page.
 *
 * Each MPA page has its own HTML entry and its own router — they don't share
 * routing state. Use hash history by default so individual pages never need
 * server-side URL rewrites. Swap to `createWebHistory` if you configure the
 * server to fall back to this page's `index.html`.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('./views/HomeLanding.vue'),
    meta: {title: 'Landing'}
  },
  {
    path: '/about',
    component: () => import('./views/HomeAbout.vue'),
    meta: {title: 'About'}
  }
];

export function createHomeRouter() {
  return createRouter({history: createWebHashHistory(), routes});
}
