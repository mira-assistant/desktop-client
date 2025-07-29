// ESLint configuration for Mira Desktop (Electron/Node.js)
// Compatible with ESLint v9+. Update plugins/rules as needed for your code style.

import js from "@eslint/js";
import node from "eslint-plugin-n";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: { n: node },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "n/no-missing-import": "error",
      "n/no-unsupported-features/es-syntax": "off"
    }
  }
];