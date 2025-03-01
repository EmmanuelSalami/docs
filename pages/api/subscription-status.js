import axios from 'axios';
import { Redis } from '@upstash/redis';
import { generateCallbackUrl } from '../../lib/pubsubhubbub';

// Initialize Redis client
const redis = new Redis({
    url: process.env.STORAGE_KV_REST_API_URL,
    token: process.env.STORAGE_KV_REST_API_TOKEN,
});

// Key for storing all subscriptions in Redis
const SUBSCRIPTIONS_KEY = 'youtube_subscriptions';

// Helper function to extract subscription details from HTML
function parseSubscriptionHtml(html, channelId) {
    try {
        // Log the full HTML for debugging
        console.log(`[Vercel] Complete HTML for channel ${channelId}:`, html);
        console.log(`[Vercel] HTML length for channel ${channelId}: ${html.length}`);

        // Check if the page indicates no subscription found
        const noSubscriptionFound = html.includes('No subscription was found');
        if (noSubscriptionFound) {
            console.log(`[Vercel] No subscription found for channel ${channelId}`);
            return {
                state: 'not found',
                expiration: 'n/a',
                lastVerification: 'n/a',
                lastSubscribe: 'n/a',
                verificationError: null,
                isSubscribed: false,
                htmlLength: html.length
            };
        }

        // Extract state
        const stateMatch = html.match(/State<\/dt>\s*<dd>([^<]+)<\/dd>/i);
        const state = stateMatch ? stateMatch[1].trim() : 'unknown';
        console.log(`[Vercel] State match for channel ${channelId}:`, stateMatch ? stateMatch[1] : 'not found');

        // Extract expiration
        const expirationMatch = html.match(/Expiration time<\/dt>\s*<dd>([^<]+)<\/dd>/i);
        const expiration = expirationMatch ? expirationMatch[1].trim() : 'unknown';
        console.log(`[Vercel] Expiration match for channel ${channelId}:`, expirationMatch ? expirationMatch[1] : 'not found');

        // Extract last verification
        const lastVerificationMatch = html.match(/Last successful verification<\/dt>\s*<dd>([^<]+)<\/dd>/i);
        const lastVerification = lastVerificationMatch ? lastVerificationMatch[1].trim() : 'unknown';
        console.log(`[Vercel] Last verification match for channel ${channelId}:`, lastVerificationMatch ? lastVerificationMatch[1] : 'not found');

        // Extract last subscribe request
        const lastSubscribeMatch = html.match(/Last subscribe request<\/dt>\s*<dd>([^<]+)<\/dd>/i);
        const lastSubscribe = lastSubscribeMatch ? lastSubscribeMatch[1].trim() : 'unknown';
        console.log(`[Vercel] Last subscribe match for channel ${channelId}:`, lastSubscribeMatch ? lastSubscribeMatch[1] : 'not found');

        // Extract verification error if any
        const verificationErrorMatch = html.match(/Last verification error<\/dt>\s*<dd>\s*([^<]+)\s*<\/dd>/i);
        const verificationError = verificationErrorMatch && verificationErrorMatch[1].trim() !== 'n/a' 
            ? verificationErrorMatch[1].trim() 
            : null;
        console.log(`[Vercel] Verification error match for channel ${channelId}:`, verificationErrorMatch ? verificationErrorMatch[1] : 'not found');

        // Try alternative patterns if the standard ones don't work
        if (!stateMatch) {
            console.log(`[Vercel] Trying alternative state pattern for channel ${channelId}`);
            const altStateMatch = html.match(/State:<\/strong>\s*([^<]+)<br>/i);
            if (altStateMatch) {
                console.log(`[Vercel] Alternative state match found for channel ${channelId}:`, altStateMatch[1]);
            }
        }

        // Log the overall result
        const isSubscribed = state === 'verified';
        console.log(`[Vercel] Subscription status for channel ${channelId}:`, {
            state,
            isSubscribed,
            expiration,
            lastVerification,
            lastSubscribe,
            verificationError
        });

        // Log the raw HTML for debugging but don't include it in the response
        console.log(`[Vercel] Raw HTML preview for channel ${channelId}:`, html.substring(0, 1000) + (html.length > 1000 ? '...' : ''));

        return {
            state,
            expiration,
            lastVerification,
            lastSubscribe,
            verificationError,
            isSubscribed,
            htmlLength: html.length
        };
    } catch (error) {
        console.error(`[Vercel] Error parsing HTML for channel ${channelId}:`, error);
        return {
            state: 'error',
            expiration: 'unknown',
            lastVerification: 'unknown',
            lastSubscribe: 'unknown',
            error: 'Failed to parse subscription details: ' + error.message,
            isSubscribed: false,
            htmlLength: html ? html.length : 0
        };
    }
}

/**
 * Gets the callback URL that was used for YouTube PubSubHubbub
 * This now uses the userKey to generate a unique callback URL for each webhook
 * 
 * @param {string} userKey - The unique user key for the webhook URL
 * @returns {string} - The callback URL for the webhook
 */
function getCallbackUrl(userKey) {
    return generateCallbackUrl(userKey);
}

/**
 * Checks if a webhook URL is from N8N (contains 'webhook-test' or 'webhook')
 * 
 * @param {string} webhookUrl - The webhook URL to check
 * @returns {boolean} - True if it's an N8N webhook URL, false otherwise
 */
function isN8nWebhook(webhookUrl) {
    return webhookUrl && 
           typeof webhookUrl === 'string' && 
           (webhookUrl.includes('webhook-test') || webhookUrl.includes('webhook'));
}

/**
 * Gets the counterpart URL for an N8N webhook
 * If it's a test webhook, returns the production URL, and vice versa
 * 
 * @param {string} webhookUrl - The webhook URL to get the counterpart for
 * @returns {string|null} - The counterpart URL, or null if not an N8N webhook
 */
function getN8nCounterpartUrl(webhookUrl) {
    if (!isN8nWebhook(webhookUrl)) return null;
    
    return webhookUrl.includes('webhook-test') 
        ? webhookUrl.replace('webhook-test', 'webhook')  // Test → Production
        : webhookUrl.replace('webhook', 'webhook-test'); // Production → Test
}

/**
 * Fetches subscription status for a specific webhook URL
 * 
 * @param {object} subscription - The subscription object from Redis
 * @returns {Promise<object>} - The subscription status
 */
async function fetchSubscriptionStatus(subscription) {
    if (!subscription) return null;
    
    const userKey = subscription.userKey;
    const callbackUrl = getCallbackUrl(userKey);
    
    console.log(`[Vercel] Checking status for ${subscription.channelIds.length} channels with callback URL: ${callbackUrl} (userKey: ${userKey})`);
    
    const channelStatuses = await Promise.all(
        subscription.channelIds.map(async (channelId) => {
            const params = new URLSearchParams({
                'hub.callback': callbackUrl,
                'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`
            });

            const url = `https://pubsubhubbub.appspot.com/subscription-details?${params.toString()}`;
            console.log(`[Vercel] Checking subscription status for channel ${channelId} at URL: ${url}`);

            try {
                console.log(`[Vercel] Making request to PubSubHubbub for channel ${channelId}`);
                const response = await axios.get(url);
                console.log(`[Vercel] Received response from PubSubHubbub for channel ${channelId}, status: ${response.status}, content length: ${response.data.length}`);
                
                const details = parseSubscriptionHtml(response.data, channelId);
                
                return {
                    channelId,
                    ...details
                };
            } catch (error) {
                console.error(`[Vercel] Error fetching subscription details for channel ${channelId}:`, error);
                return {
                    channelId,
                    state: 'error',
                    error: error.message,
                    isSubscribed: false
                };
            }
        })
    );

    // Calculate overall subscription status
    const allVerified = channelStatuses.every(channel => channel.isSubscribed);
    const anyVerified = channelStatuses.some(channel => channel.isSubscribed);
    const overallStatus = allVerified ? 'all verified' : anyVerified ? 'partially verified' : 'none verified';
    
    return {
        webhookUrl: subscription.webhookUrl,
        userKey: subscription.userKey,
        callbackUrl,
        overallStatus,
        channels: channelStatuses.map(c => {
            // Remove htmlLength from the response
            const { htmlLength, ...rest } = c;
            return rest;
        })
    };
}

export default async function handler(req, res) {
    console.log('[Vercel] Subscription status check started:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        query: req.query,
        headers: {
            host: req.headers.host,
            'user-agent': req.headers['user-agent']
        }
    });

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get webhook URL from query parameter
    const { webhookUrl } = req.query;
    if (!webhookUrl) {
        console.log('[Vercel] Missing webhookUrl parameter');
        return res.status(400).json({ error: 'webhookUrl query parameter is required' });
    }

    console.log(`[Vercel] Checking subscription status for webhook URL: ${webhookUrl}`);

    try {
        // Get all subscriptions from Redis
        const allSubscriptions = await redis.get(SUBSCRIPTIONS_KEY) || [];
        console.log('[Vercel] All subscriptions from Redis:', JSON.stringify(allSubscriptions));
        
        // Find the subscription for this webhook URL
        const primarySubscription = allSubscriptions.find(sub => sub.webhookUrl === webhookUrl);
        
        if (!primarySubscription) {
            console.log(`[Vercel] No subscription found in Redis for webhook URL: ${webhookUrl}`);
            return res.status(404).json({ 
                error: 'No subscriptions found for this webhook URL' 
            });
        }

        console.log('[Vercel] Found primary subscription in Redis:', JSON.stringify(primarySubscription));
        
        // Get the status for the primary subscription
        const primaryStatus = await fetchSubscriptionStatus(primarySubscription);
        
        // Check if this is an N8N webhook and if it has a counterpart
        const isN8n = isN8nWebhook(webhookUrl);
        let relatedStatus = null;
        
        if (isN8n) {
            const counterpartUrl = getN8nCounterpartUrl(webhookUrl);
            console.log(`[Vercel] Checking for N8N counterpart webhook URL: ${counterpartUrl}`);
            
            const relatedSubscription = allSubscriptions.find(sub => sub.webhookUrl === counterpartUrl);
            
            if (relatedSubscription) {
                console.log('[Vercel] Found related subscription in Redis:', JSON.stringify(relatedSubscription));
                relatedStatus = await fetchSubscriptionStatus(relatedSubscription);
            } else {
                console.log(`[Vercel] No related subscription found for counterpart URL: ${counterpartUrl}`);
            }
        }
        
        // Prepare the response
        const response = {
            status: 'success',
            primary: primaryStatus,
            related: relatedStatus,
            debug: {
                timestamp: new Date().toISOString(),
                requestUrl: req.url,
                isN8nWebhook: isN8n
            }
        };
        
        console.log('[Vercel] Subscription status check completed');
        return res.status(200).json(response);

    } catch (error) {
        console.error('[Vercel] Error checking subscription status:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message,
            stack: error.stack
        });
    }
} 