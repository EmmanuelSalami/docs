import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
    url: process.env.STORAGE_KV_REST_API_URL,
    token: process.env.STORAGE_KV_REST_API_TOKEN,
});

// Key for storing all subscriptions in Redis
const SUBSCRIPTIONS_KEY = 'youtube_subscriptions';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get all subscriptions from Redis
        const subscriptions = await redis.get(SUBSCRIPTIONS_KEY) || [];
        console.log('[Vercel] Found subscriptions:', subscriptions);

        return res.status(200).json({
            status: 'success',
            debug: {
                redisUrl: process.env.STORAGE_KV_REST_API_URL ? 'Configured' : 'Missing',
                redisToken: process.env.STORAGE_KV_REST_API_TOKEN ? 'Configured' : 'Missing',
                subscriptionsFound: subscriptions.length
            },
            subscriptions
        });

    } catch (error) {
        console.error('[Vercel] Error listing subscriptions:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message,
            stack: error.stack
        });
    }
} 