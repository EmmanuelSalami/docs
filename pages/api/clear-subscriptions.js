/**
 * Clear All Subscriptions API Endpoint
 * 
 * This API endpoint clears all subscriptions from Redis.
 * Use this endpoint with caution as it will delete all subscription data.
 * This is primarily for development and testing purposes.
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
    url: process.env.STORAGE_KV_REST_API_URL,
    token: process.env.STORAGE_KV_REST_API_TOKEN,
});

// Key for storing all subscriptions in Redis
const SUBSCRIPTIONS_KEY = 'youtube_subscriptions';

/**
 * Main API handler function for the /api/clear-subscriptions endpoint
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 */
export default async function handler(req, res) {
    console.log('[Vercel] Clear subscriptions API called:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: {
            host: req.headers.host,
            'user-agent': req.headers['user-agent']
        }
    });

    // Allow both DELETE and POST requests for flexibility
    if (req.method !== 'DELETE' && req.method !== 'POST') {
        return res.status(405).json({ 
            status: 'error',
            message: 'Method not allowed. Please use DELETE or POST.' 
        });
    }

    try {
        // Clear all subscriptions from Redis
        await redis.del(SUBSCRIPTIONS_KEY);
        
        console.log('[Vercel] Successfully cleared all subscriptions from Redis');
        
        return res.status(200).json({
            status: 'success',
            message: 'All subscriptions have been cleared from Redis',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Vercel] Error clearing subscriptions:', error);
        
        return res.status(500).json({
            status: 'error',
            message: 'Failed to clear subscriptions',
            error: error.message
        });
    }
} 