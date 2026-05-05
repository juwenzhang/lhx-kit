import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'business-smoke-web',
  framework: 'react',

  aliases: {
    '@stores': 'src/stores',
    '@services': 'src/services',
    '@mocks': 'src/mocks'
  },

  envs: {
    dev: {
      apiBase: '/api',
      proxy: {
        '/api': {target: 'http://localhost:3000', changeOrigin: true}
      }
    },
    prod: {apiBase: 'https://api.example.com'}
  },

  pages: {
    home: {title: 'business-smoke - Home'},
    settings: {title: 'business-smoke - Settings'}
  }

  // Uncomment to enable offline packaging for hybrid WebView deployment:
  // offline: {enabled: true}
});
