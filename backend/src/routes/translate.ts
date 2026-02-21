import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { translateText, getDeepLConfig, SUPPORTED_LANGUAGES } from '../services/deepl.js';
import { prisma } from '../utils/prisma.js';
import { 
  getMonthlyUsage, 
  incrementUsage, 
  getDailyUsage, 
  incrementDailyUsage,
  getCachedTranslation,
  cacheTranslation 
} from '../utils/redis.js';

const translateSchema = z.object({
  text: z.string().min(1).max(10000),
  source: z.string().default('auto'),
  target: z.string(),
  context: z.object({
    direction: z.enum(['incoming', 'outgoing']).optional(),
  }).optional(),
});

export async function translateRoutes(fastify: FastifyInstance) {
  // Translate text
  fastify.post('/translate', { preHandler: authMiddleware }, async (request, reply) => {
    const body = translateSchema.safeParse(request.body);
    
    if (!body.success) {
      return reply.status(400).send({ 
        error: { code: 'VALIDATION_ERROR', message: body.error.message } 
      });
    }
    
    const { text, source, target, context } = body.data;
    const userId = request.user!.id;
    
    // Check if DeepL is configured
    const config = await getDeepLConfig();
    if (!config) {
      return reply.status(503).send({ 
        error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Translation provider is not configured' } 
      });
    }
    
    // Get user limits
    const userWithLimits = await prisma.user.findUnique({
      where: { id: userId },
      include: { limits: true },
    });
    
    const limits = userWithLimits?.limits;
    const charCount = text.length;
    
    // Check limits if not unlimited
    if (limits && !limits.isUnlimited) {
      const monthlyUsage = await getMonthlyUsage(userId);
      const dailyUsage = await getDailyUsage(userId);
      
      if (monthlyUsage + charCount > limits.monthlyLimitChars) {
        return reply.status(429).send({ 
          error: { 
            code: 'LIMIT_EXCEEDED', 
            message: 'Monthly character limit exceeded',
            details: {
              type: 'monthly',
              used: monthlyUsage,
              limit: limits.monthlyLimitChars,
            }
          } 
        });
      }
      
      if (dailyUsage + charCount > limits.dailyLimitChars) {
        return reply.status(429).send({ 
          error: { 
            code: 'LIMIT_EXCEEDED', 
            message: 'Daily character limit exceeded',
            details: {
              type: 'daily',
              used: dailyUsage,
              limit: limits.dailyLimitChars,
            }
          } 
        });
      }
    }
    
    // Check cache first
    const cached = await getCachedTranslation(text, source, target);
    if (cached) {
      // Still count cached translations against limits
      if (limits && !limits.isUnlimited) {
        await incrementUsage(userId, charCount);
        await incrementDailyUsage(userId, charCount);
      }
      
      return {
        translatedText: cached,
        detectedSourceLang: source === 'auto' ? 'CACHED' : source,
        charCount,
        cached: true,
      };
    }
    
    // Call DeepL
    try {
      const result = await translateText(text, target, source === 'auto' ? undefined : source);
      
      // Update usage
      if (limits && !limits.isUnlimited) {
        await incrementUsage(userId, result.charCount);
        await incrementDailyUsage(userId, result.charCount);
      }
      
      // Update database usage for analytics
      const month = new Date().toISOString().slice(0, 7);
      await prisma.usageMonthly.upsert({
        where: {
          userId_month: { userId, month },
        },
        create: {
          userId,
          month,
          charsUsed: result.charCount,
        },
        update: {
          charsUsed: { increment: result.charCount },
        },
      });
      
      // Cache the translation
      await cacheTranslation(text, source, target, result.translatedText);
      
      return {
        translatedText: result.translatedText,
        detectedSourceLang: result.detectedSourceLang,
        charCount: result.charCount,
        cached: false,
      };
    } catch (error: any) {
      if (error.message === 'PROVIDER_NOT_CONFIGURED') {
        return reply.status(503).send({ 
          error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Translation provider is not configured' } 
        });
      }
      if (error.message === 'INVALID_API_KEY') {
        return reply.status(503).send({ 
          error: { code: 'INVALID_API_KEY', message: 'DeepL API key is invalid' } 
        });
      }
      if (error.message === 'QUOTA_EXCEEDED') {
        return reply.status(503).send({ 
          error: { code: 'PROVIDER_QUOTA_EXCEEDED', message: 'DeepL API quota exceeded' } 
        });
      }
      
      console.error('Translation error:', error);
      return reply.status(500).send({ 
        error: { code: 'TRANSLATION_FAILED', message: 'Translation failed' } 
      });
    }
  });
  
  // Get supported languages
  fastify.get('/languages', async (request, reply) => {
    return { languages: SUPPORTED_LANGUAGES };
  });
  
  // Get user usage stats
  fastify.get('/usage', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    
    const monthlyUsage = await getMonthlyUsage(userId);
    const dailyUsage = await getDailyUsage(userId);
    
    const userWithLimits = await prisma.user.findUnique({
      where: { id: userId },
      include: { limits: true },
    });
    
    const limits = userWithLimits?.limits;
    
    return {
      monthly: {
        used: monthlyUsage,
        limit: limits?.isUnlimited ? null : limits?.monthlyLimitChars,
        isUnlimited: limits?.isUnlimited ?? false,
      },
      daily: {
        used: dailyUsage,
        limit: limits?.isUnlimited ? null : limits?.dailyLimitChars,
        isUnlimited: limits?.isUnlimited ?? false,
      },
    };
  });
}
