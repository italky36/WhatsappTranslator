import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import path from 'path';
import { fileURLToPath } from 'url';
import { access, readFile, writeFile } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { adminMiddleware } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { testApiKey } from '../services/deepl.js';
import { getMonthlyUsage, getDailyUsage } from '../utils/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(__dirname, '../../..');

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeOrigins(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCorsValue(envContent: string): { value: string | null; lineIndex: number } {
  const lines = envContent.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*CORS_ORIGINS\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let raw = match[1].trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    return { value: raw, lineIndex: i };
  }
  return { value: null, lineIndex: -1 };
}

async function loadEnvFile(): Promise<{ filePath: string; content: string }> {
  const candidates = [
    path.join(REPO_ROOT, '.env'),
    path.join(BACKEND_ROOT, '.env'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const content = await readFile(candidate, 'utf8');
      return { filePath: candidate, content };
    }
  }

  return { filePath: candidates[0], content: '' };
}

function upsertCorsInEnv(content: string, corsValue: string): string {
  const lines = content ? content.split(/\r?\n/) : [];
  const { lineIndex } = extractCorsValue(content);
  const newLine = `CORS_ORIGINS="${corsValue}"`;

  if (lineIndex >= 0) {
    lines[lineIndex] = newLine;
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(newLine);
  }

  return lines.join('\n');
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).default('user'),
  isUnlimited: z.boolean().default(false),
  monthlyLimitChars: z.number().int().positive().default(500000),
  dailyLimitChars: z.number().int().positive().default(50000),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'blocked']).optional(),
  isUnlimited: z.boolean().optional(),
  monthlyLimitChars: z.number().int().positive().optional(),
  dailyLimitChars: z.number().int().positive().optional(),
});

const deeplSettingsSchema = z.object({
  apiKey: z.string().min(1),
  endpoint: z.enum(['https://api-free.deepl.com', 'https://api.deepl.com']),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // List users
  fastify.get('/admin/users', { preHandler: adminMiddleware }, async (request, reply) => {
    const users = await prisma.user.findMany({
      include: {
        limits: true,
        usageMonthly: {
          where: {
            month: new Date().toISOString().slice(0, 7),
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const usersWithUsage = await Promise.all(users.map(async (user) => {
      const monthlyUsage = await getMonthlyUsage(user.id);
      const dailyUsage = await getDailyUsage(user.id);
      
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        limits: user.limits ? {
          isUnlimited: user.limits.isUnlimited,
          monthlyLimitChars: user.limits.monthlyLimitChars,
          dailyLimitChars: user.limits.dailyLimitChars,
        } : null,
        usage: {
          monthly: monthlyUsage,
          daily: dailyUsage,
        },
      };
    }));
    
    return { users: usersWithUsage };
  });
  
  // Create user
  fastify.post('/admin/users', { preHandler: adminMiddleware }, async (request, reply) => {
    const body = createUserSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }
    
    const { email, password, role, isUnlimited, monthlyLimitChars, dailyLimitChars } = body.data;
    
    // Check if email exists
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return reply.status(409).send({ error: { code: 'EMAIL_EXISTS', message: 'Email already exists' } });
    }
    
    const passwordHash = await argon2.hash(password);
    
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role,
        status: 'active',
        limits: {
          create: {
            isUnlimited,
            monthlyLimitChars,
            dailyLimitChars,
          },
        },
      },
      include: { limits: true },
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: 'USER_CREATED',
        targetUserId: user.id,
        meta: JSON.stringify({ email: user.email, role }),
      },
    });
    
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      limits: user.limits,
    };
  });
  
  // Get single user
  fastify.get('/admin/users/:id', { preHandler: adminMiddleware }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: { limits: true },
    });
    
    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND' } });
    }
    
    const monthlyUsage = await getMonthlyUsage(user.id);
    const dailyUsage = await getDailyUsage(user.id);
    
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      limits: user.limits,
      usage: {
        monthly: monthlyUsage,
        daily: dailyUsage,
      },
    };
  });
  
  // Update user
  fastify.patch('/admin/users/:id', { preHandler: adminMiddleware }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }
    
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND' } });
    }
    
    const { email, password, role, status, isUnlimited, monthlyLimitChars, dailyLimitChars } = body.data;
    
    // Update user
    const userData: any = {};
    if (email) userData.email = email.toLowerCase();
    if (password) userData.passwordHash = await argon2.hash(password);
    if (role) userData.role = role;
    if (status) userData.status = status;
    
    const user = await prisma.user.update({
      where: { id },
      data: userData,
    });
    
    // Update limits if provided
    if (isUnlimited !== undefined || monthlyLimitChars !== undefined || dailyLimitChars !== undefined) {
      await prisma.userLimit.upsert({
        where: { userId: id },
        create: {
          userId: id,
          isUnlimited: isUnlimited ?? false,
          monthlyLimitChars: monthlyLimitChars ?? 500000,
          dailyLimitChars: dailyLimitChars ?? 50000,
        },
        update: {
          ...(isUnlimited !== undefined && { isUnlimited }),
          ...(monthlyLimitChars !== undefined && { monthlyLimitChars }),
          ...(dailyLimitChars !== undefined && { dailyLimitChars }),
        },
      });
    }
    
    // If user is blocked, revoke all sessions
    if (status === 'blocked') {
      await prisma.refreshSession.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });
    }
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: 'USER_UPDATED',
        targetUserId: id,
        meta: JSON.stringify(body.data),
      },
    });
    
    return { success: true };
  });
  
  // Delete user
  fastify.delete('/admin/users/:id', { preHandler: adminMiddleware }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Prevent self-deletion
    if (id === request.user!.id) {
      return reply.status(400).send({ error: { code: 'CANNOT_DELETE_SELF' } });
    }
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND' } });
    }
    
    await prisma.user.delete({ where: { id } });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: 'USER_DELETED',
        targetUserId: null,
        meta: JSON.stringify({ deletedEmail: user.email }),
      },
    });
    
    return { success: true };
  });
  
  // Get DeepL settings
  fastify.get('/admin/settings/deepl', { preHandler: adminMiddleware }, async (request, reply) => {
    const keyRecord = await prisma.appSetting.findUnique({ where: { key: 'deepl_api_key' } });
    const endpointRecord = await prisma.appSetting.findUnique({ where: { key: 'deepl_endpoint' } });
    
    if (!keyRecord) {
      return { configured: false };
    }
    
    try {
      const apiKey = decrypt(keyRecord.valueEncrypted);
      const endpoint = endpointRecord ? decrypt(endpointRecord.valueEncrypted) : 'https://api-free.deepl.com';
      
      // Mask the key
      const maskedKey = apiKey.length > 8 
        ? '****' + apiKey.slice(-4)
        : '****';
      
      return {
        configured: true,
        maskedKey,
        endpoint,
        updatedAt: keyRecord.updatedAt,
      };
    } catch {
      return { configured: false, error: 'Decryption failed' };
    }
  });
  
  // Update DeepL settings
  fastify.post('/admin/settings/deepl', { preHandler: adminMiddleware }, async (request, reply) => {
    const body = deeplSettingsSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }
    
    const { apiKey, endpoint } = body.data;
    
    // Test the key first
    const testResult = await testApiKey(apiKey, endpoint);
    if (!testResult.valid) {
      return reply.status(400).send({ 
        error: { code: 'INVALID_API_KEY', message: testResult.error } 
      });
    }
    
    // Encrypt and store
    const encryptedKey = encrypt(apiKey);
    const encryptedEndpoint = encrypt(endpoint);
    
    await prisma.appSetting.upsert({
      where: { key: 'deepl_api_key' },
      create: { key: 'deepl_api_key', valueEncrypted: encryptedKey },
      update: { valueEncrypted: encryptedKey },
    });
    
    await prisma.appSetting.upsert({
      where: { key: 'deepl_endpoint' },
      create: { key: 'deepl_endpoint', valueEncrypted: encryptedEndpoint },
      update: { valueEncrypted: encryptedEndpoint },
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: 'DEEPL_SETTINGS_UPDATED',
        meta: JSON.stringify({ endpoint }),
      },
    });
    
    return { 
      success: true,
      usage: testResult.usage,
    };
  });
  
  // Test DeepL key
  fastify.post('/admin/settings/deepl/test', { preHandler: adminMiddleware }, async (request, reply) => {
    const body = z.object({
      apiKey: z.string().optional(),
      endpoint: z.enum(['https://api-free.deepl.com', 'https://api.deepl.com']).optional(),
    }).safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR' } });
    }
    
    let apiKey = body.data.apiKey?.trim();
    let endpoint = body.data.endpoint?.trim();
    
    if (!apiKey) {
      const keyRecord = await prisma.appSetting.findUnique({ where: { key: 'deepl_api_key' } });
      if (!keyRecord) {
        return reply.status(400).send({ 
          error: { code: 'DEEPL_NOT_CONFIGURED', message: 'DeepL API key not configured' } 
        });
      }
      try {
        apiKey = decrypt(keyRecord.valueEncrypted);
      } catch {
        return reply.status(400).send({ 
          error: { code: 'DEEPL_DECRYPT_FAILED', message: 'Failed to decrypt stored API key' } 
        });
      }
    }
    
    if (!endpoint) {
      const endpointRecord = await prisma.appSetting.findUnique({ where: { key: 'deepl_endpoint' } });
      if (endpointRecord) {
        try {
          endpoint = decrypt(endpointRecord.valueEncrypted);
        } catch {
          endpoint = 'https://api-free.deepl.com';
        }
      } else {
        endpoint = 'https://api-free.deepl.com';
      }
    }
    
    const result = await testApiKey(apiKey, endpoint);
    return result;
  });

  // Get CORS origins
  fastify.get('/admin/settings/cors', { preHandler: adminMiddleware }, async () => {
    const { filePath, content } = await loadEnvFile();
    const extracted = extractCorsValue(content);
    const fileOrigins = normalizeOrigins(extracted.value);
    const activeOrigins = normalizeOrigins(process.env.CORS_ORIGINS || '*');

    return {
      origins: fileOrigins.length ? fileOrigins : activeOrigins,
      activeOrigins,
      filePath,
      requiresRestart: true,
    };
  });

  // Add CORS origin (chrome-extension id)
  fastify.post('/admin/settings/cors', { preHandler: adminMiddleware }, async (request, reply) => {
    const body = z.object({
      extensionId: z.string().min(1),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR' } });
    }

    const rawInput = body.data.extensionId.trim();
    const parts = rawInput.split(',').map((p) => p.trim()).filter(Boolean);
    const normalizedOrigins: string[] = [];

    for (const part of parts) {
      if (part.startsWith('chrome-extension://')) {
        normalizedOrigins.push(part);
      } else {
        normalizedOrigins.push(`chrome-extension://${part}`);
      }
    }

    const { filePath, content } = await loadEnvFile();
    const extracted = extractCorsValue(content);
    const currentOrigins = normalizeOrigins(extracted.value);

    const merged = new Set([...currentOrigins, ...normalizedOrigins]);
    const updatedOrigins = Array.from(merged);

    const updatedContent = upsertCorsInEnv(content, updatedOrigins.join(','));
    await writeFile(filePath, updatedContent, 'utf8');

    return {
      success: true,
      origins: updatedOrigins,
      filePath,
      requiresRestart: true,
    };
  });
  
  // Get audit logs
  fastify.get('/admin/audit', { preHandler: adminMiddleware }, async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
    
    const logs = await prisma.auditLog.findMany({
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { email: true } },
        target: { select: { email: true } },
      },
    });
    
    return { logs };
  });
}
