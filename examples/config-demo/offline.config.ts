import {defineOfflineConfig} from '@lhx-kit/config';

export default defineOfflineConfig({
  enabled: true,
  versions: {prod: '12', test: '34'},
  whitelistPages: ['home', 'cashier'],
  prefetch: [
    {
      name: 'home-api',
      match: {page: 'home'},
      keys: ['uid'],
      apiUrl: 'https://api.example.com/home?uid=${uid}',
      priority: 'high'
    }
  ]
});
