import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    alias: [
      { find: /^(.*)\.js$/, replacement: '$1' }
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/db/migrations/**',
        'src/mikro-orm.config.ts',
      ],
      reporter: ['text', 'json', 'html'],
    },
  },
});
