import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [lhxKit(), vue()]
});
