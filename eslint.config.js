import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**/*',
      'coverage/**/*',
      'node_modules/**/*',
      '__tests__/**/*.test.js' // Allow more relaxed rules for tests
    ]
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // Code quality rules
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': ['warn', { 
        allow: ['warn', 'error'] 
      }],
      'prefer-const': 'error',
      'no-var': 'error',
      
      // Style rules
      'indent': ['error', 2],
      'quotes': ['error', 'single', { 
        avoidEscape: true,
        allowTemplateLiterals: true 
      }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'only-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': ['error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always'
      }],
      
      // Best practices
      'eqeqeq': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': 'error',
      'radix': 'error',
      
      // Error prevention
      'no-await-in-loop': 'warn',
      'no-promise-executor-return': 'error',
      'no-unreachable-loop': 'error',
      'require-atomic-updates': 'error'
    }
  },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.jest
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // More relaxed rules for tests
      'no-console': 'off',
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_|^testUtils$'
      }],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    files: ['*.config.js', 'rollup.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off'
    }
  }
]; 