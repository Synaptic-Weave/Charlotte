import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { User } from '../src/domain/entities/User.js';
import { Organization } from '../src/domain/entities/Organization.js';
import { TwilioPhoneNumber } from '../src/domain/entities/TwilioPhoneNumber.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { TwilioPhoneNumberSchema } from '../src/domain/schemas/TwilioPhoneNumber.schema.js';
import { authenticateToken } from '../src/middleware/auth.js';

let createAuthRouter: any;
let createNumbersRouter: any;

const JWT_SECRET = process.env.JWT_SECRET || 'charlotte_super_secret_jwt_sign_key_change_me_in_production';

// Self-healing database connection discovery helper
async function setupTestDatabase(): Promise<string> {
  const possibleUrls = [
    process.env.DATABASE_URL,
    'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://postgres@localhost:5432/charlotte_db?sslmode=disable',
    'postgresql://localhost:5432/charlotte_db?sslmode=disable',
  ].filter((url): url is string => !!url);

  for (const url of possibleUrls) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      return url;
    } catch (e) {
      // Ignore and try next
    }
  }

  // Administrative fallback
  const systemUrl = 'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable';
  const client = new Client({ connectionString: systemUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'charlotte_db'");
    if (res.rowCount === 0) {
      await client.query("CREATE DATABASE charlotte_db");
    }
  } catch (e) {
    throw new Error('Could not resolve postgres connection or create charlotte_db.');
  } finally {
    await client.end();
  }

  return 'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable';
}
