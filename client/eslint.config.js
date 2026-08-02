import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

// Correctness-only lint: flat/recommended for real Vue/JS mistakes, with the
// plugin's no-layout-rules overlay so formatting is out of scope — a reformat
// sweep would churn all 60 components and pollute blame.
export default [
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  { rules: { ...pluginVue.configs['no-layout-rules'].rules } },
  {
    rules: {
      // Attribute order/hyphenation are consistency sweeps with heavy autofix
      // churn — deferred to the pattern-review charter, not gated here.
      'vue/attributes-order': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      // House pattern: *FormFields children edit fields of a parent-owned
      // reactive form object passed as a prop (~33 sites). Whether to keep
      // that pattern is a review-charter question, not a lint gate.
      'vue/no-mutating-props': 'off',
      'vue/multi-word-component-names': ['error', { ignores: ['Breadcrumbs'] }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        VG: 'readonly',
      },
    },
  },
  {
    // SharedWorker scripts: worker global scope, onconnect entry point.
    files: ['public/workers/**/*.js', 'public/*.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        onconnect: 'writable',
      },
    },
  },
  {
    files: ['**/tests/**/*.js', '**/*.test.js', 'vite.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]
