import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This project intentionally co-locates context providers with their
      // hooks (useAuth, usePartner, …) and field components with small helpers.
      // The rule only affects Vite Fast Refresh DX, not correctness, so we opt
      // out of it rather than fragmenting those modules.
      'react-refresh/only-export-components': 'off',
    },
  },
])
