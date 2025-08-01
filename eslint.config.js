// ESLint configuration for Mira Desktop (Electron/Node.js)
// Compatible with ESLint v9+. Update plugins/rules as needed for your code style.

const js = require("@eslint/js");
const node = require("eslint-plugin-n");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    // Configuration for CommonJS/script files (main.js, eslint.config.js, etc.)
    files: ["*.js", "main.js", "preload.js", "start-script.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.browser,
        vad: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        Float32Array: "readonly",
        Int16Array: "readonly",
        Uint8Array: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly"
      }
    },
    plugins: { n: node },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "n/no-missing-import": "error",
      "n/no-unsupported-features/es-syntax": "off"
    }
  },
  {
    // Configuration for ES Module files (constants.js, models.js, api.js, renderer.js)
    files: ["constants.js", "models.js", "api.js", "renderer.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        vad: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        Float32Array: "readonly",
        Int16Array: "readonly",
        Uint8Array: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        navigator: "readonly",
        Map: "readonly",
        Set: "readonly",
        Date: "readonly",
        Error: "readonly",
        Promise: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off"
    }
  }
];