import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { translateText, translateBatch, getDeepLConfig, SUPPORTED_LANGUAGES } from '../services/deepl.js';
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
  
  // Batch translate segments
  const batchTranslateSchema = z.object({
    segments: z.array(z.object({
      text: z.string().max(10000),
      index: z.number().int().min(0),
    })).min(1).max(500),
    source: z.string().default('auto'),
    target: z.string(),
  });

  fastify.post('/translate/batch', { preHandler: authMiddleware }, async (request, reply) => {
    const body = batchTranslateSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: body.error.message }
      });
    }

    const { segments, source, target } = body.data;
    const userId = request.user!.id;

    // Check if DeepL is configured
    const config = await getDeepLConfig();
    if (!config) {
      return reply.status(503).send({
        error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Translation provider is not configured' }
      });
    }

    // Calculate total char count (all non-empty segments)
    const totalCharCount = segments.reduce((sum, s) => sum + s.text.length, 0);

    // Get user limits
    const userWithLimits = await prisma.user.findUnique({
      where: { id: userId },
      include: { limits: true },
    });

    const limits = userWithLimits?.limits;

    // Check limits before translation
    if (limits && !limits.isUnlimited) {
      const monthlyUsage = await getMonthlyUsage(userId);
      const dailyUsage = await getDailyUsage(userId);

      if (monthlyUsage + totalCharCount > limits.monthlyLimitChars) {
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

      if (dailyUsage + totalCharCount > limits.dailyLimitChars) {
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

    // Sort segments by index for consistent processing
    const sortedSegments = [...segments].sort((a, b) => a.index - b.index);

    // Check cache for each segment individually
    const results: Array<{ translatedText: string; index: number }> = [];
    const uncachedSegments: Array<{ text: string; index: number; position: number }> = [];
    let cachedCount = 0;

    for (let i = 0; i < sortedSegments.length; i++) {
      const seg = sortedSegments[i];

      // Empty segments — return as-is
      if (seg.text === '') {
        results.push({ translatedText: '', index: seg.index });
        continue;
      }

      const cached = await getCachedTranslation(seg.text, source, target);
      if (cached) {
        results.push({ translatedText: cached, index: seg.index });
        cachedCount++;
      } else {
        uncachedSegments.push({ text: seg.text, index: seg.index, position: results.length });
        results.push({ translatedText: '', index: seg.index }); // placeholder
      }
    }

    let detectedSourceLang = '';

    // Translate uncached segments via batch
    if (uncachedSegments.length > 0) {
      try {
        const batchResult = await translateBatch(
          uncachedSegments.map(s => s.text),
          target,
          source === 'auto' ? undefined : source
        );

        // Fill in results and cache each translation
        for (let i = 0; i < uncachedSegments.length; i++) {
          const seg = uncachedSegments[i];
          const translation = batchResult.translations[i];

          // Find and update the placeholder in results
          const resultIdx = results.findIndex(r => r.index === seg.index);
          if (resultIdx !== -1) {
            results[resultIdx].translatedText = translation.translatedText;
          }

          if (!detectedSourceLang && translation.detectedSourceLang) {
            detectedSourceLang = translation.detectedSourceLang;
          }

          // Cache each new translation
          await cacheTranslation(seg.text, source, target, translation.translatedText);
        }
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

        console.error('Batch translation error:', error);
        return reply.status(500).send({
          error: { code: 'TRANSLATION_FAILED', message: 'Batch translation failed' }
        });
      }
    }

    // Increment usage once for total char count
    if (totalCharCount > 0 && limits && !limits.isUnlimited) {
      await incrementUsage(userId, totalCharCount);
      await incrementDailyUsage(userId, totalCharCount);
    }

    // Update database usage for analytics
    if (totalCharCount > 0) {
      const month = new Date().toISOString().slice(0, 7);
      await prisma.usageMonthly.upsert({
        where: {
          userId_month: { userId, month },
        },
        create: {
          userId,
          month,
          charsUsed: totalCharCount,
        },
        update: {
          charsUsed: { increment: totalCharCount },
        },
      });
    }

    // Sort results by index
    results.sort((a, b) => a.index - b.index);

    return {
      results,
      totalCharCount,
      detectedSourceLang,
    };
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
