// ESLint configuration for Mira Desktop (Electron/Node.js)
// Compatible with ESLint v9+. Update plugins/rules as needed for your code style.

const js = require("@eslint/js");
const node = require("eslint-plugin-n");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
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