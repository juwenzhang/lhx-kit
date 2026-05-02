import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'renderer-react-demo',
  framework: 'react',
  envs: {
    dev: {apiBase: '/api'},
    prod: {apiBase: 'https://api.example.com'}
  },
  pages: {
    home: {title: 'Renderer demo - Home (React)'},
    profile: {title: 'Renderer demo - Profile (React)'}
  }
});
