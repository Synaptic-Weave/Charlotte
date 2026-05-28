import { defineConfig } from '@mikro-orm/postgresql';
import { UnderscoreNamingStrategy } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  clientUrl: process.env.DATABASE_URL || 'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
  entities: ['./dist/domain/schemas'],
  entitiesTs: ['./src/domain/schemas'],
  namingStrategy: UnderscoreNamingStrategy,
  extensions: [Migrator],
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
  },
  migrations: {
    path: './dist/db/migrations',
    pathTs: './src/db/migrations',
    tableName: 'mikro_orm_migrations',
    transactional: true,
  },
  debug: process.env.NODE_ENV === 'development',
});
