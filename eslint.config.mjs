import eslintjs from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslintjs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/routes/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@mikro-orm/core",
              message: "Do not import MikroORM directly in routes. Use service/repository layers.",
            },
            {
              name: "@mikro-orm/postgresql",
              message: "Do not import MikroORM directly in routes. Use service/repository layers.",
            },
            {
              name: "knex",
              message: "Do not import knex directly in routes. Use service/repository layers.",
            },
          ],
        },
      ],
    },
  }
);
