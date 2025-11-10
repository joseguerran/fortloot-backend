// Test setup file
// Runs before all tests

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fortloot_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_SECRET = 'test-secret';

// Increase timeout for integration tests
jest.setTimeout(10000);
