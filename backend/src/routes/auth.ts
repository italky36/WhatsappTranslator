import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../utils/prisma.js';
import { hashToken, generateToken } from '../utils/crypto.js';
import { authMiddleware } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }
    
    const { email, password } = body.data;
    
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    
    if (!user) {
      return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    
    if (user.status === 'blocked') {
      return reply.status(403).send({ error: { code: 'USER_BLOCKED', message: 'Your account has been blocked' } });
    }
    
    const validPassword = await argon2.verify(user.passwordHash, password);
    
    if (!validPassword) {
      return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    
    // Generate tokens
    const accessToken = fastify.jwt.sign(
      { userId: user.id, type: 'access' },
      { expiresIn: '30m' }
    );
    
    const refreshToken = generateToken();
    const refreshTokenHash = hashToken(refreshToken);
    
    // Store refresh session
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
    
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  });
  
  // Refresh token
  fastify.post('/auth/refresh', async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Refresh token required' } });
    }
    
    const { refreshToken } = body.data;
    const tokenHash = hashToken(refreshToken);
    
    const session = await prisma.refreshSession.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    
    if (!session) {
      return reply.status(401).send({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    }
    
    if (session.user.status === 'blocked') {
      // Revoke all sessions for blocked user
      await prisma.refreshSession.updateMany({
        where: { userId: session.userId },
        data: { revokedAt: new Date() },
      });
      return reply.status(403).send({ error: { code: 'USER_BLOCKED', message: 'Your account has been blocked' } });
    }
    
    // Revoke old session
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    
    // Generate new tokens
    const newAccessToken = fastify.jwt.sign(
      { userId: session.userId, type: 'access' },
      { expiresIn: '30m' }
    );
    
    const newRefreshToken = generateToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);
    
    await prisma.refreshSession.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  });
  
  // Logout
  fastify.post('/auth/logout', { preHandler: authMiddleware }, async (request, reply) => {
    const refreshToken = (request.body as any)?.refreshToken;
    
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshSession.updateMany({
        where: { refreshTokenHash: tokenHash },
        data: { revokedAt: new Date() },
      });
    }
    
    return { success: true };
  });
  
  // Get current user
  fastify.get('/auth/me', { preHandler: authMiddleware }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      include: {
        limits: true,
      },
    });
    
    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND' } });
    }
    
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      limits: user.limits ? {
        isUnlimited: user.limits.isUnlimited,
        monthlyLimitChars: user.limits.monthlyLimitChars,
        dailyLimitChars: user.limits.dailyLimitChars,
      } : null,
    };
  });
}
