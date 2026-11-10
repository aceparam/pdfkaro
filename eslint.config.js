import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  { ignores: ['dist/', 'dist-base/', '.astro/', 'node_modules/', 'design/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    // Components get what they show through props. From src/tools/ they may
    // take only the filter rule and types, so the registry stays out of the
    // script a page ships and components stay reusable.
    files: ['src/components/**', 'src/hooks/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/tools/*', '!**/tools/filter'],
              allowTypeImports: true,
              message: 'Components may import only the filter rule and types from src/tools/. Pass data in through props.',
            },
          ],
        },
      ],
      // The same rule for import() calls, which the rule above does not see.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/tools\\//]',
          message: 'Components may not load src/tools/ with import(). Pass data in through props.',
        },
        // A link written as "/path" in a component would break on a preview under
        // a sub-path, and the built-page check cannot see a link that only shows
        // after the visitor does something. Links come in through props.
        {
          selector: 'JSXAttribute[name.name=/^(href|src|action)$/] > Literal[value=/^\\//]',
          message: 'Do not write a link as "/path" in a component. Take it as a prop; pages build it with withBase.',
        },
        {
          selector: 'JSXAttribute[name.name=/^(href|src|action)$/] > JSXExpressionContainer > Literal[value=/^\\//]',
          message: 'Do not write a link as "/path" in a component. Take it as a prop; pages build it with withBase.',
        },
        {
          selector: 'JSXAttribute[name.name=/^(href|src|action)$/] > JSXExpressionContainer > TemplateLiteral[quasis.0.value.raw=/^\\//]',
          message: 'Do not write a link as "/path" in a component. Take it as a prop; pages build it with withBase.',
        },
      ],
    },
  },
);
