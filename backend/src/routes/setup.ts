import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../utils/prisma.js';

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function setupRoutes(fastify: FastifyInstance) {
  // Check if setup is needed
  fastify.get('/setup/status', async (request, reply) => {
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });
    
    return {
      setupRequired: adminCount === 0,
    };
  });
  
  // Create first admin
  fastify.post('/setup/create-admin', async (request, reply) => {
    // Check if admin already exists
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });
    
    if (adminCount > 0) {
      return reply.status(403).send({ 
        error: { code: 'SETUP_COMPLETED', message: 'Setup has already been completed' } 
      });
    }
    
    const body = createAdminSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ 
        error: { code: 'VALIDATION_ERROR', message: body.error.message } 
      });
    }
    
    const { email, password } = body.data;
    
    // Create admin user
    const passwordHash = await argon2.hash(password);
    
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role: 'admin',
        status: 'active',
        limits: {
          create: {
            isUnlimited: true,
          },
        },
      },
    });
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'ADMIN_CREATED',
        targetUserId: user.id,
        meta: JSON.stringify({ initialSetup: true }),
      },
    });
    
    // Auto-login: generate tokens
    const accessToken = fastify.jwt.sign(
      { userId: user.id, type: 'access' },
      { expiresIn: '30m' }
    );
    
    const crypto = await import('crypto');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const { hashToken } = await import('../utils/crypto.js');
    const refreshTokenHash = hashToken(refreshToken);
    
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    
    return {
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  });
}
