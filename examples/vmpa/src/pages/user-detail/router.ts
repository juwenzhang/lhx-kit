import {createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('./views/UserDetailPage.vue'),
    meta: {title: 'User Detail'}
  },
  {
    path: '/user/:id',
    component: () => import('./views/UserDetailPage.vue'),
    meta: {title: 'User Detail'}
  }
];

export function createUserDetailRouter() {
  return createRouter({history: createWebHashHistory(), routes});
}
