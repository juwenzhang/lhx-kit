import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'demo-mpa',
  framework: 'vue3',
  envs: {
    dev: {
      apiBase: '/api',
      proxy: {
        '/api': {target: 'http://localhost:3000', changeOrigin: true}
      }
    },
    prod: {
      apiBase: 'https://api.example.com',
      publicPath: 'https://cdn.example.com/demo/'
    }
  },
  aliases: {
    '@services': 'src/services'
  },
  pages: {
    home: {title: '首页', namespace: 'home'},
    cashier: {title: '收银台', offline: true},
    orders: {title: '我的订单'}
  },
  offline: {enabled: true}
});
