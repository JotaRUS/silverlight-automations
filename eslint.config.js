const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const eslintConfigPrettier = require("eslint-config-prettier");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "prisma/migrations/**"]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs["strict-type-checked"].rules,
      ...tsPlugin.configs["stylistic-type-checked"].rules,
      ...eslintConfigPrettier.rules,
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"]
    }
  }
];
