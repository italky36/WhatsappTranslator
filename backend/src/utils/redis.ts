import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

export async function connectRedis() {
  try {
    await redis.connect();
  } catch (err) {
    // Already connected or connecting
  }
}

// Usage tracking
export async function getMonthlyUsage(userId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `usage:${userId}:${month}`;
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}

export async function incrementUsage(userId: string, chars: number): Promise<number> {
  const month = new Date().toISOString().slice(0, 7);
  const key = `usage:${userId}:${month}`;
  const newValue = await redis.incrby(key, chars);
  // Set expiry to 45 days (covers the month + buffer)
  await redis.expire(key, 45 * 24 * 60 * 60);
  return newValue;
}

export async function getDailyUsage(userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `usage:daily:${userId}:${day}`;
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}

export async function incrementDailyUsage(userId: string, chars: number): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:daily:${userId}:${day}`;
  const newValue = await redis.incrby(key, chars);
  // Set expiry to 2 days
  await redis.expire(key, 2 * 24 * 60 * 60);
  return newValue;
}

// Translation cache
export async function getCachedTranslation(
  text: string,
  source: string,
  target: string
): Promise<string | null> {
  const key = `trans:${source}:${target}:${Buffer.from(text).toString('base64').slice(0, 100)}`;
  return redis.get(key);
}

export async function cacheTranslation(
  text: string,
  source: string,
  target: string,
  translation: string
): Promise<void> {
  const key = `trans:${source}:${target}:${Buffer.from(text).toString('base64').slice(0, 100)}`;
  // Cache for 24 hours
  await redis.setex(key, 24 * 60 * 60, translation);
}
