import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';

// Every worker starts from a blob: address through one helper, so it runs under
// the page's Content Security Policy (src/workers/start-worker.ts). A worker
// started straight from a file would run with no policy at all. ESLint lets a
// later block replace an earlier one's setting for a rule, so every block below
// that sets no-restricted-syntax repeats these.
const workerStarts = [
  'NewExpression[callee.name=/^(Shared)?Worker$/]',
  'NewExpression[callee.property.name=/^(Shared)?Worker$/]',
  'NewExpression[callee.property.value=/^(Shared)?Worker$/]',
  'NewExpression[callee.property.quasis.0.value.raw=/^(Shared)?Worker$/]',
].map((selector) => ({
  selector,
  message: 'Start a worker only with workerFromBlob in src/workers/start-worker.ts, so it runs under the page policy.',
}));

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
    files: ['src/**'],
    ignores: ['src/workers/start-worker.ts'],
    rules: { 'no-restricted-syntax': ['error', ...workerStarts] },
  },
  {
    // Engines are pure: bytes in, bytes out. They never reach the page or the network.
    files: ['src/engines/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'self',
          'globalThis',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'caches',
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'importScripts',
          'postMessage',
        ].map((name) => ({ name, message: 'Engines use no page and no network. What they need comes in through `tools`.' })),
        // Pictures are decoded only through `tools.decodePicture`, so the picture code stays pure.
        ...['createImageBitmap', 'OffscreenCanvas', 'Blob', 'Image', 'ImageDecoder'].map((name) => ({
          name,
          message: 'Engines decode no picture themselves. The worker gives a decoder and a canvas through `tools`.',
        })),
      ],
      // PDF.js comes in through `tools`, already loaded, so it is never bundled into an engine's file.
      // Its types may be imported; a value, such as one of its constants, is read from the module given.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pdfjs-dist', 'pdfjs-dist/*'],
              allowTypeImports: true,
              message: 'Engines take PDF.js from `tools.pdfjs`. Read its constants from the module given; import its types only.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...workerStarts,
        {
          selector: 'ImportExpression[source.value=/^pdfjs-dist/]',
          message: 'Engines take PDF.js from `tools.pdfjs`, never with import().',
        },
      ],
    },
  },
  {
    // The worker and its client fetch nothing either: engines and WebAssembly
    // come in through the bundler's own imports, never through a request the
    // code writes itself.
    files: ['src/workers/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'localStorage', 'sessionStorage', 'indexedDB', 'caches'].map(
          (name) => ({ name, message: 'The worker sends nothing anywhere and stores nothing.' }),
        ),
      ],
    },
  },
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
            {
              // Hooks are part of the island, so an engine imported here would load with the page.
              group: ['**/engines/*'],
              allowTypeImports: true,
              message: 'Components and hooks do not import engines. Only the worker loads them.',
            },
          ],
        },
      ],
      // The same rules for import() calls, which the rule above does not see.
      'no-restricted-syntax': [
        'error',
        ...workerStarts,
        {
          selector: 'ImportExpression[source.value=/tools\\//]',
          message: 'Components may not load src/tools/ with import(). Pass data in through props.',
        },
        {
          selector: 'ImportExpression[source.value=/engines\\//]',
          message: 'Components and hooks may not load an engine with import(). Only the worker loads them.',
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
  {
    // Components and pages never load an engine or a worker themselves. The
    // workspace starts the worker by its address; types are fine. This block
    // repeats the src/tools/ rule, because a later block replaces an earlier
    // one's setting for the same rule.
    files: ['src/components/**'],
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
            {
              group: ['**/engines/*'],
              allowTypeImports: true,
              message: 'Components and pages do not import engines.',
            },
            {
              group: ['**/workers/*'],
              allowTypeImports: true,
              message: 'Components and pages do not import workers. Take what you need through a hook.',
            },
          ],
        },
      ],
    },
  },
  {
    // Every end-to-end test runs under the Content Security Policy watch, which comes with `test` from ./fixtures.
    files: ['tests/e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@playwright/test', importNames: ['test', 'expect'], message: 'Import test and expect from ./fixtures' }] },
      ],
    },
  },
  {
    // Pages read the registry and pass it on, but never load an engine or a worker.
    files: ['src/pages/**', 'src/layouts/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/engines/*'], allowTypeImports: true, message: 'Pages do not import engines.' },
            { group: ['**/workers/*'], allowTypeImports: true, message: 'Pages do not import workers.' },
          ],
        },
      ],
    },
  },
);
