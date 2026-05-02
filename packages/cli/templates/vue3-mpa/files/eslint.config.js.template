// Flat config for ESLint v9. See https://eslint.org/docs/latest/use/configure/configuration-files-new
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import eslint from '@eslint/js';
import vuePlugin from 'eslint-plugin-vue';
import vueTsConfig from '@vue/eslint-config-typescript';

function loadAutoImportGlobals() {
  const file = fileURLToPath(new URL('./.eslintrc-auto-import.json', import.meta.url));
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return raw.globals ?? {};
  }
  catch {
    return {};
  }
}

export default [
  eslint.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  ...vueTsConfig(),
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: loadAutoImportGlobals()
    },
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    ignores: [
      'dist',
      'dist-offline',
      'node_modules',
      '.lhx-kit',
      'public/mockServiceWorker.js',
      'src/types/auto-imports.d.ts',
      'src/types/components.d.ts',
      '*.config.js',
      '*.config.ts',
      '*.config.cjs'
    ]
  }
];
