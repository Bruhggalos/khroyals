const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  { ignores: ['**/build/**', '**/.gradle/**', 'src/api/database.types.ts', 'src/handbook/text.ts'] },
  { files: ['src/api/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  { rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' } },
]);
