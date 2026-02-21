import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; type: string };
    user: {
      id: string;
      email: string;
      role: string;
      status: string;
    };
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
    }
    
    const decoded = await request.jwtVerify<{ userId: string; type: string }>();
    
    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid token type' } });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, status: true }
    });
    
    if (!user) {
      return reply.status(401).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    
    if (user.status === 'blocked') {
      return reply.status(403).send({ error: { code: 'USER_BLOCKED', message: 'User is blocked' } });
    }
    
    request.user = user;
  } catch (err) {
    return reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  await authMiddleware(request, reply);
  
  if (reply.sent) return;
  
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }
}
