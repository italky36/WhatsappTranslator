import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDatabase } from './utils/prisma.js';
import { connectRedis, redis } from './utils/redis.js';
import { authRoutes } from './routes/auth.js';
import { setupRoutes } from './routes/setup.js';
import { translateRoutes } from './routes/translate.js';
import { adminRoutes } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({
  logger: true,
});

// CORS
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['*'];
await fastify.register(cors, {
  origin: corsOrigins,
  credentials: true,
});

// JWT
await fastify.register(jwt, {
  secret: process.env.JWT_ACCESS_SECRET || 'super-secret-key-change-me',
});

// Rate limiting
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

// Static files for admin panel
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/',
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Register routes
await fastify.register(authRoutes);
await fastify.register(setupRoutes);
await fastify.register(translateRoutes);
await fastify.register(adminRoutes);

// Start server
const start = async () => {
  try {
    // Connect to databases
    await connectDatabase();
    await connectRedis();
    
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
