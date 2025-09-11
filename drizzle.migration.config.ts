import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: './migration-schema.ts', // Use production-aligned schema
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEON_PROD_DATABASE_URL!, // Target production
  },
});