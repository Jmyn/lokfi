# Lokfi Web

Personal finance dashboard built with React + TypeScript + Vite.

## Features

- **Unified transaction view** — Bank transactions and brokerage data (trades, dividends, fees) are merged into a single timeline on `/transactions`. Switch between **All**, **Bank**, and **Brokerage** tabs. Brokerage rows are read-only and visually distinct (neutral gray for BUY/SELL, green for DIVIDEND, red for FEE).
- **Portfolio hub** — Tabbed `/portfolio` page with Overview (KPI cards, asset allocation donut chart, currency breakdown, performance sparkline), Holdings (grouped positions table with P&L), Transactions (enhanced unified view with Type/Symbol/Qty/Price columns), and Dividends (YTD summary, monthly bar chart, yield-on-cost). Supports currency conversion via cached FX rates.
- **Brokerage settings** — Configure Tiger Brokers API credentials, test connectivity, trigger manual sync, and set historical lookback days at `/settings/brokerage`. Credentials are encrypted with AES-256-GCM via the Web Crypto API.
- **Rule engine** — Auto-categorise bank transactions based on custom rules with priority ordering.
- **PDF import** — Parse bank statements directly in the browser using `pdfjs-dist` in a Web Worker.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
