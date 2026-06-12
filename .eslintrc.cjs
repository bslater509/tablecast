// =============================================================================
// Tablecast — ESLint Configuration (shared between server and client)
// =============================================================================
"use strict";

const ERROR = "error";
const WARN = "warn";
const OFF = "off";

module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: false,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["react", "react-hooks"],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    // ── Potential Errors ──────────────────────────────────────────────────
    "no-cond-assign": [ERROR, "except-parens"],
    "no-constant-condition": [WARN, { checkLoops: false }],
    "no-dupe-args": ERROR,
    "no-dupe-keys": ERROR,
    "no-duplicate-case": ERROR,
    "no-empty": [WARN, { allowEmptyCatch: true }],
    "no-ex-assign": ERROR,
    "no-extra-boolean-cast": WARN,
    "no-func-assign": ERROR,
    "no-inner-declarations": ERROR,
    "no-irregular-whitespace": ERROR,
    "no-obj-calls": ERROR,
    "no-unexpected-multiline": WARN,
    "no-unreachable": WARN,
    "use-isnan": ERROR,
    "valid-typeof": ERROR,

    // ── Best Practices ────────────────────────────────────────────────────
    "array-callback-return": WARN,
    "consistent-return": WARN,
    curly: [WARN, "multi-line"],
    "default-case": WARN,
    "dot-notation": WARN,
    eqeqeq: [ERROR, "smart"],
    "no-caller": ERROR,
    "no-case-declarations": WARN,
    "no-else-return": WARN,
    "no-empty-pattern": WARN,
    "no-eval": ERROR,
    "no-extend-native": ERROR,
    "no-extra-label": WARN,
    "no-fallthrough": WARN,
    "no-floating-decimal": WARN,
    "no-global-assign": ERROR,
    "no-implicit-coercion": [WARN, { allow: ["!!"] }],
    "no-implied-eval": ERROR,
    "no-iterator": ERROR,
    "no-labels": ERROR,
    "no-lone-blocks": WARN,
    "no-loop-func": WARN,
    "no-multi-str": WARN,
    "no-new": WARN,
    "no-new-func": WARN,
    "no-new-wrappers": ERROR,
    "no-proto": ERROR,
    "no-redeclare": ERROR,
    "no-return-assign": [WARN, "except-parens"],
    "no-self-assign": [WARN, { props: true }],
    "no-self-compare": WARN,
    "no-sequences": WARN,
    "no-throw-literal": WARN,
    "no-unmodified-loop-condition": WARN,
    "no-unused-expressions": WARN,
    "no-useless-call": WARN,
    "no-useless-concat": WARN,
    "no-useless-escape": WARN,
    "no-useless-return": WARN,
    "no-void": ERROR,
    "no-with": ERROR,
    "prefer-promise-reject-errors": WARN,
    radix: ERROR,
    yoda: WARN,

    // ── Variables ─────────────────────────────────────────────────────────
    "no-delete-var": ERROR,
    "no-label-var": ERROR,
    "no-shadow": OFF, // Allow shadowing (common in JS patterns)
    "no-undef": ERROR,
    "no-undef-init": WARN,
    "no-unused-vars": [WARN, { args: "after-used", ignoreRestSiblings: true }],
    "no-use-before-define": [WARN, { functions: false, classes: false }],

    // ── Stylistic ─────────────────────────────────────────────────────────
    // Prettier handles formatting; these are just sanity rules
    "consistent-this": [WARN, "self"],
    "linebreak-style": [ERROR, "unix"],
    "max-len": OFF,
    "new-parens": ERROR,
    "no-lonely-if": WARN,
    "no-multiple-empty-lines": [WARN, { max: 2, maxEOF: 1 }],
    "no-tabs": ERROR,
    "no-trailing-spaces": WARN,
    "no-unneeded-ternary": WARN,
    "one-var": [WARN, "never"],
    "prefer-const": WARN,
    "prefer-template": WARN,
    "quote-props": [WARN, "as-needed"],
    quotes: [WARN, "double", { avoidEscape: true, allowTemplateLiterals: true }],
    semi: [WARN, "always"],
    "spaced-comment": [WARN, "always", {
      line: { markers: ["/"] },
      block: { balanced: true },
    }],

    // ── ES6+ ──────────────────────────────────────────────────────────────
    "arrow-body-style": [WARN, "as-needed"],
    "no-duplicate-imports": WARN,
    "no-useless-computed-key": WARN,
    "no-useless-constructor": WARN,
    "no-var": ERROR,
    "object-shorthand": WARN,
    "prefer-arrow-callback": WARN,
    "prefer-destructuring": [WARN, {
      VariableDeclarator: { array: false, object: true },
      AssignmentExpression: { array: false, object: false },
    }],
    "prefer-rest-params": WARN,
    "prefer-spread": WARN,
    "rest-spread-spacing": [WARN, "never"],
    "template-curly-spacing": [WARN, "never"],
  },
  overrides: [
    // ── Client-side (React/Browser) ──────────────────────────────────────
    {
      files: ["client/src/**/*.jsx", "client/src/**/*.js"],
      env: {
        browser: true,
        node: false,
      },
      globals: {
        React: "readonly",
      },
      rules: {
        "react/jsx-uses-react": OFF,
        "react/jsx-uses-vars": WARN,
        "react-hooks/rules-of-hooks": ERROR,
        "react-hooks/exhaustive-deps": WARN,
      },
    },
    // ── Node/CommonJS ─────────────────────────────────────────────────────
    {
      files: ["server/**/*.js", "*.cjs", "*.cjs"],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        "no-console": OFF, // Server uses structured logger but console is OK in scripts
      },
    },
  ],
};
