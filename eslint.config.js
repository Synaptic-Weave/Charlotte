const typescriptEslintPlugin = require("@typescript-eslint/eslint-plugin");
const typescriptEslintParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslintPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["*AdminService*"],
              "message": "AdminService isolation: AdminService should not be imported directly."
            },
            {
              "group": ["*bypassRLS*", "*rlsBypass*", "*disableRLS*"],
              "message": "RLS bypass isolation: Do not import RLS bypass directly."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/routes/**/*.ts"],
    ignores: ["src/routes/calls.ts", "src/routes/integrations.ts", "src/routes/numbers.ts", "src/routes/streams.ts", "src/routes/webhooks.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["@mikro-orm/*"],
              "message": "NO DIRECT EM ACCESS FROM ROUTES. They should delegate all EM access to application services."
            }
          ]
        }
      ]
    }
  }
];
