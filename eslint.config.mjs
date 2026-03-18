import { defineConfig, globalIgnores } from 'eslint/config'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import jestPlugin from 'eslint-plugin-jest'
import github from 'eslint-plugin-github'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default defineConfig([
  globalIgnores([
    '**/.*',
    '**/node_modules/.*',
    '**/dist/*',
    '**/coverage/*',
    '**/*.json'
  ]),
  tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    github.getFlatConfigs().recommended,
    ...github.getFlatConfigs().typescript,
    {
      files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
      ignores: ['eslint.config.mjs'],
      rules: {
        'github/array-foreach': 'error',
        'github/async-preventdefault': 'warn',
        'github/no-then': 'error',
        'github/no-blur': 'error'
      }
    },
    {
      plugins: {
        '@typescript-eslint': tseslint.plugin,
        jest: jestPlugin,
        '@stylistic': stylistic
      },
      languageOptions: {
        globals: {
          ...globals.node,
          ...globals.jest,
          Atomics: 'readonly',
          SharedArrayBuffer: 'readonly'
        },

        parser: tseslint.parser,
        parserOptions: {
          tsconfigRootDir: import.meta.dirname
        }
      }
    },
    {
      rules: {
        camelcase: 'off',
        'eslint-comments/no-use': 'off',
        'eslint-comments/no-unused-disable': 'off',
        'i18n-text/no-en': 'off',
        'import/no-namespace': 'off',
        'no-console': 'off',
        'no-unused-vars': 'off',
        'prettier/prettier': 'error',
        semi: 'off',
        '@typescript-eslint/array-type': 'error',
        '@typescript-eslint/ban-ts-comment': 'error',
        '@typescript-eslint/consistent-type-assertions': 'error',
        '@typescript-eslint/explicit-member-accessibility': [
          'error',
          {
            accessibility: 'no-public'
          }
        ],
        '@typescript-eslint/explicit-function-return-type': [
          'error',
          {
            allowExpressions: true
          }
        ],
        '@typescript-eslint/no-array-constructor': 'error',
        '@typescript-eslint/no-empty-interface': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-extraneous-class': 'error',
        '@typescript-eslint/no-for-in-array': 'error',
        '@typescript-eslint/no-inferrable-types': 'error',
        '@typescript-eslint/no-misused-new': 'error',
        '@typescript-eslint/no-namespace': 'error',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/no-require-imports': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/no-var-requires': 'error',
        '@typescript-eslint/prefer-for-of': 'warn',
        '@typescript-eslint/prefer-function-type': 'warn',
        '@typescript-eslint/space-before-function-paren': 'off',
        '@stylistic/function-call-spacing': ['error', 'never'],
        '@stylistic/semi': ['error', 'never'],
        '@stylistic/type-annotation-spacing': 'error'
      }
    }
  )
])
