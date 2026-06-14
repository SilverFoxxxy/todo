// eslint.config.js
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier, // MUST BE LAST – disables all conflicting formatting rules
  {
    languageOptions: {
      globals: {
        crypto: 'readonly',
        localStorage: 'readonly',
        alert: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        FileReader: 'readonly',
        confirm: 'readonly',
        location: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        google: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      // Code quality rules (not formatting)
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-useless-catch': 'warn',
      // If you still want to disable any specific import/order rules:
      'sort-imports': 'off',
      'sort-keys': 'off',
      'vue/attributes-order': 'off',
    },
  },
  { ignores: ['public/sw.js'] },
];
