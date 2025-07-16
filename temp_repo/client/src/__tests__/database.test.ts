import { pool, db } from '@/server/db';

// Mock the @neondatabase/serverless module
jest.mock('@neondatabase/serverless', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  })),
  neonConfig: {
    webSocketConstructor: null
  }
}));

// Mock the drizzle-orm module
jest.mock('drizzle-orm/neon-serverless', () => ({
  drizzle: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([]),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    }),
  }),
}));

// Set environment variable for testing
process.env.DATABASE_URL = 'postgresql://test:test@test.com/test';

describe('Database Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.DATABASE_URL;
  });

  it('creates a database pool with correct connection string', () => {
    // Re-import to test instantiation
    jest.isolateModules(() => {
      const { pool } = require('@/server/db');
      expect(pool).toBeDefined();
      
      // The Pool constructor should be called with the DATABASE_URL
      const { Pool } = require('@neondatabase/serverless');
      expect(Pool).toHaveBeenCalledWith({ 
        connectionString: process.env.DATABASE_URL 
      });
    });
  });

  it('initializes drizzle instance with pool and schema', () => {
    // Re-import to test instantiation
    jest.isolateModules(() => {
      const { db } = require('@/server/db');
      expect(db).toBeDefined();
      
      // drizzle should be called with client and schema
      const { drizzle } = require('drizzle-orm/neon-serverless');
      expect(drizzle).toHaveBeenCalledWith(expect.objectContaining({ 
        client: expect.anything(),
        schema: expect.anything()
      }));
    });
  });

  it('throws error when DATABASE_URL is not set', () => {
    // Temporarily remove DATABASE_URL
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    
    // Re-import should throw an error
    expect(() => {
      jest.isolateModules(() => {
        require('@/server/db');
      });
    }).toThrow('DATABASE_URL must be set');
    
    // Restore DATABASE_URL
    process.env.DATABASE_URL = originalUrl;
  });
});