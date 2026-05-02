import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [lhxKit(), react()]
});
