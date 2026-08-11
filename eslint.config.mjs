import node from '@zaiusinc/eslint-config-presets/node.mjs';
import vitest from '@zaiusinc/eslint-config-presets/vitest.mjs';

// ─────────────────────────────────────────────────────────────────────
// Source-tree directory conventions.
//
// The boundary rules below enforce that backend code, UI extension code,
// and shared code stay in their lanes. They key off these path constants,
// so if you rename any of these folders under src/, update them here too.
// ─────────────────────────────────────────────────────────────────────
const BACKEND_ROOT = 'src/backend';
const UI_EXTENSIONS_ROOT = 'src/cms-ui-extensions';
const SHARED_ROOT = 'src/shared';

const FILES_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs}';

export default [
  ...node,
  ...vitest,

  // Shared code is isomorphic — must not pull in backend SDKs, frontend
  // libraries, Node built-ins, or reach across into either build root.
  {
    files: [`${SHARED_ROOT}/${FILES_GLOB}`],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {name: '@zaiusinc/app-sdk', message: 'Do not import backend SDK from shared code.'},
          {name: '@zaiusinc/node-sdk', message: 'Do not import node SDK from shared code.'},
          {name: 'react', message: 'Do not import frontend-only libraries from shared code.'},
          {name: 'react-dom', message: 'Do not import frontend-only libraries from shared code.'}
        ],
        patterns: [
          {
            group: ['node:*', `${BACKEND_ROOT}/*`, `${UI_EXTENSIONS_ROOT}/*`],
            message: 'Shared code must remain isomorphic and app-boundary safe.'
          }
        ]
      }]
    }
  },

  // Backend code must not import frontend (UI extension) sources.
  {
    files: [`${BACKEND_ROOT}/${FILES_GLOB}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [`${UI_EXTENSIONS_ROOT}/*`],
            message: 'Backend code must not import frontend sources.'
          }
        ]
      }]
    }
  },

  // Frontend (UI extension) code must not import backend SDKs, Node
  // built-ins, or backend sources. The CMS-UI-extensions plugin SDK is
  // also off-limits at runtime — frontend code talks to the
  // `@optimizely/cms-extensibility-sdk` runtime contract, not the backend
  // plugin wrappers in `@optimizely/ocp-cms-ui-extensions-sdk`.
  {
    files: [`${UI_EXTENSIONS_ROOT}/${FILES_GLOB}`],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {name: '@zaiusinc/node-sdk', message: 'Frontend code must not import node SDK.'},
          {name: '@zaiusinc/app-sdk', message: 'Frontend code must not import app-sdk runtime APIs directly.'},
          {
            name: '@optimizely/ocp-cms-ui-extensions-sdk',
            message: 'Frontend extension code must use cms-extensions-sdk runtime contract, not backend app SDK wrappers.'
          }
        ],
        patterns: [
          {
            group: ['node:*', `${BACKEND_ROOT}/*`],
            message: 'Frontend code must not import backend-only modules.'
          }
        ]
      }]
    }
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
