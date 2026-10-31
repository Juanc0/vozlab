import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

const nodeGlobals = {
  console: 'readonly', process: 'readonly', Buffer: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', require: 'readonly',
  module: 'readonly', exports: 'readonly', setTimeout: 'readonly',
  setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly',
};

export default [
  { ignores: ['**/node_modules', '**/.next', '**/.svelte-kit', '**/build', '**/dist', '**/coverage', '**/*.js', '**/*.mjs', '**/*.cjs', '**/.agents/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, globals: nodeGlobals },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
];