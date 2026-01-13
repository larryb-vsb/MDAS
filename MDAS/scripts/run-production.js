#!/usr/bin/env tsx
// Production mode test script
process.env.NODE_ENV = 'production';

await import('./server/index.ts');