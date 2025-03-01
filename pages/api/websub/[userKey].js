/**
 * YouTube WebSub Dynamic Endpoint with UserKey
 * 
 * This API endpoint serves two purposes:
 * 1. Verification: Handles GET requests from YouTube to verify our subscription (hub.challenge)
 * 2. Notification: Handles POST requests from YouTube when new videos are published
 * 
 * The [userKey] in the URL path is used to identify which webhook URL to forward notifications to.
 * This allows us to have unique callback URLs for each webhook URL.
 * 
 * For verification (GET):
 * - YouTube sends a GET request with hub.challenge
 * - We must respond with the same hub.challenge value to confirm subscription
 * 
 * For notification (POST):
 * - YouTube sends a POST request with Atom XML feed data about the new video
 * - We parse this data and forward it to the appropriate webhooks based on the userKey
 */

import { Redis } from '@upstash/redis';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

// Initialize Redis client
const redis = new Redis({
    url: process.env.STORAGE_KV_REST_API_URL,
    token: process.env.STORAGE_KV_REST_API_TOKEN,
});

// Key for storing all subscriptions in Redis
const SUBSCRIPTIONS_KEY = 'youtube_subscriptions';

// Initialize XML parser with options
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry'].includes(name)
});

/**
 * Main API handler function for the /api/websub/[userKey] endpoint
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 */
export default async function handler(req, res) {
  // Extract the userKey from the URL
  const { userKey } = req.query;
  
  // Log the incoming request for debugging
  console.log('[Vercel] Received WebSub request with userKey:', {
    userKey,
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    },
    timestamp: new Date().toISOString()
  });

  // Handle GET requests (verification)
  if (req.method === 'GET') {
    return handleVerification(req, res, userKey);
  }
  
  // Handle POST requests (notification)
  if (req.method === 'POST') {
    return handleNotification(req, res, userKey);
  }

  // If neither GET nor POST, return method not allowed
  return res.status(405).json({
    success: false,
    message: 'Method not allowed. Please use GET or POST.'
  });
}

/**
 * Handle verification requests from YouTube
 * 
 * When YouTube wants to verify our subscription, it sends a GET request with:
 * - hub.mode: 'subscribe' or 'unsubscribe'
 * - hub.topic: The topic URL we're subscribing to
 * - hub.challenge: A random string we need to echo back
 * - hub.lease_seconds: How long the subscription is valid for
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 * @param {string} userKey - The user key from the URL
 */
function handleVerification(req, res, userKey) {
  const { 
    'hub.mode': mode,
    'hub.topic': topic,
    'hub.challenge': challenge,
    'hub.lease_seconds': leaseSeconds
  } = req.query;

  // Log the verification request details
  console.log('[Vercel] WebSub verification request for userKey:', { userKey, mode, topic, challenge, leaseSeconds });

  // Verify that we have the required parameters
  if (!mode || !topic || !challenge) {
    console.error('[Vercel] Missing required verification parameters for userKey:', userKey);
    return res.status(400).json({
      success: false,
      message: 'Missing required verification parameters'
    });
  }

  // For now, we'll accept all verification requests
  // In a production environment, you might want to verify that this is a topic you actually subscribed to
  
  // Echo back the challenge to confirm subscription
  console.log(`[Vercel] Responding to ${mode} verification for userKey ${userKey} with challenge: ${challenge}`);
  return res.status(200).send(challenge);
}

/**
 * Checks if a webhook URL is a test URL (contains 'webhook-test')
 * 
 * @param {string} webhookUrl - The webhook URL to check
 * @returns {boolean} - True if it's a test webhook URL, false otherwise
 */
function isTestWebhook(webhookUrl) {
  return webhookUrl && typeof webhookUrl === 'string' && webhookUrl.includes('webhook-test');
}

/**
 * Extracts channel ID from a YouTube topic URL
 * 
 * @param {string} topicUrl - The YouTube topic URL
 * @returns {string|null} - The channel ID or null if not found
 */
function extractChannelIdFromTopic(topicUrl) {
  try {
    const url = new URL(topicUrl);
    const channelId = url.searchParams.get('channel_id');
    return channelId;
  } catch (error) {
    console.error('[Vercel] Error extracting channel ID from topic URL:', error);
    return null;
  }
}

/**
 * Parse YouTube's Atom XML feed to extract video information
 * 
 * @param {string} xmlData - The XML data from YouTube
 * @returns {object|null} - Parsed video information or null if parsing failed
 */
function parseYouTubeNotification(xmlData) {
  try {
    // Parse the XML data
    const result = parser.parse(xmlData);
    console.log('[Vercel] Parsed XML result:', JSON.stringify(result));
    
    // Check if we have a feed with entries
    if (!result.feed || !result.feed.entry || result.feed.entry.length === 0) {
      console.log('[Vercel] No entries found in the feed');
      return null;
    }
    
    // Get the first entry (the new video)
    const entry = result.feed.entry[0];
    
    // Extract the video information
    const videoInfo = {
      videoId: entry['yt:videoId'] || null,
      channelId: entry['yt:channelId'] || null,
      title: entry.title || null,
      link: entry.link && entry.link['@_href'] ? entry.link['@_href'] : null,
      author: entry.author && entry.author.name ? entry.author.name : null,
      published: entry.published || null,
      updated: entry.updated || null,
      // Include the raw entry for debugging
      rawEntry: entry
    };
    
    console.log('[Vercel] Extracted video information:', videoInfo);
    return videoInfo;
  } catch (error) {
    console.error('[Vercel] Error parsing YouTube notification XML:', error);
    return null;
  }
}

/**
 * Forward the notification to a webhook URL
 * 
 * @param {string} webhookUrl - The webhook URL to forward to
 * @param {object} videoInfo - The video information to forward
 * @returns {Promise<object>} - The result of the forwarding attempt
 */
async function forwardToWebhook(webhookUrl, videoInfo) {
  try {
    console.log(`[Vercel] Forwarding notification to webhook URL: ${webhookUrl}`);
    
    // Create a clean payload for the webhook
    const payload = {
      event: 'youtube.video.published',
      video: {
        id: videoInfo.videoId,
        title: videoInfo.title,
        url: videoInfo.link,
        published_at: videoInfo.published,
        updated_at: videoInfo.updated
      },
      channel: {
        id: videoInfo.channelId,
        name: videoInfo.author
      },
      timestamp: new Date().toISOString()
    };
    
    // Send the payload to the webhook URL
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log(`[Vercel] Successfully forwarded to ${webhookUrl}, status: ${response.status}`);
    return {
      success: true,
      statusCode: response.status,
      webhookUrl
    };
  } catch (error) {
    console.error(`[Vercel] Error forwarding to webhook URL ${webhookUrl}:`, error);
    return {
      success: false,
      error: error.message,
      webhookUrl
    };
  }
}

/**
 * Handle notification requests from YouTube
 * 
 * When a new video is published, YouTube sends a POST request with Atom XML feed data
 * We'll use the userKey to determine which webhook URL to forward the notification to
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 * @param {string} userKey - The user key from the URL
 */
async function handleNotification(req, res, userKey) {
  // Log the notification request with detailed information
  console.log('[Vercel] Received notification from YouTube for userKey:', userKey);
  console.log('[Vercel] Notification headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'user-agent': req.headers['user-agent']
  });
  
  try {
    // Get the raw body content
    const rawBody = req.body;
    console.log('[Vercel] Raw notification body type:', typeof rawBody);
    
    // If the body is not a string (e.g., it's already parsed as JSON), convert it back to a string
    const xmlData = typeof rawBody === 'string' 
      ? rawBody 
      : JSON.stringify(rawBody);
    
    // Log a preview of the XML data
    console.log('[Vercel] Raw notification body preview:', 
      xmlData.substring(0, 500) + (xmlData.length > 500 ? '...' : '')
    );
    
    // Parse the YouTube notification
    const videoInfo = parseYouTubeNotification(xmlData);
    
    if (!videoInfo) {
      console.error('[Vercel] Failed to parse YouTube notification for userKey:', userKey);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse YouTube notification'
      });
    }
    
    // Get all subscriptions from Redis
    const allSubscriptions = await redis.get(SUBSCRIPTIONS_KEY) || [];
    
    // Find the subscription for this userKey
    const subscription = allSubscriptions.find(sub => sub.userKey === userKey);
    
    if (!subscription) {
      console.error('[Vercel] No subscription found for userKey:', userKey);
      return res.status(404).json({
        success: false,
        message: 'No subscription found for this userKey'
      });
    }
    
    // Log the found subscription
    console.log('[Vercel] Found subscription for userKey:', { 
      userKey, 
      webhookUrl: subscription.webhookUrl,
      channelIds: subscription.channelIds
    });
    
    // Check if the notification is for a channel we're subscribed to
    const channelId = videoInfo.channelId;
    if (!channelId || !subscription.channelIds.includes(channelId)) {
      console.warn(`[Vercel] Received notification for channel ${channelId} but it's not in our subscription list for userKey ${userKey}`);
      // We'll still forward it, but log a warning
    }
    
    // Forward the notification to the primary webhook URL
    const primaryWebhookUrl = subscription.webhookUrl;
    const forwardingResult = await forwardToWebhook(primaryWebhookUrl, videoInfo);
    
    // Determine if this is an N8N webhook and get its counterpart
    let counterpartWebhookUrl = null;
    let counterpartForwardingResult = null;
    
    // Check if this is an N8N webhook (contains 'webhook-test' or 'webhook')
    const isN8nWebhook = primaryWebhookUrl && 
                         typeof primaryWebhookUrl === 'string' && 
                         (primaryWebhookUrl.includes('webhook-test') || primaryWebhookUrl.includes('webhook'));
    
    if (isN8nWebhook) {
      // Get the counterpart webhook URL (test → prod or prod → test)
      counterpartWebhookUrl = primaryWebhookUrl.includes('webhook-test') 
        ? primaryWebhookUrl.replace('webhook-test', 'webhook')  // Test → Production
        : primaryWebhookUrl.replace('webhook', 'webhook-test'); // Production → Test
      
      console.log(`[Vercel] N8N webhook detected. Also forwarding to counterpart webhook URL: ${counterpartWebhookUrl}`);
      
      // Forward to the counterpart webhook URL
      counterpartForwardingResult = await forwardToWebhook(counterpartWebhookUrl, videoInfo);
    }
    
    // Return a success response
    return res.status(200).json({
      success: true,
      message: 'Notification processed and forwarded',
      userKey,
      videoId: videoInfo.videoId,
      channelId: videoInfo.channelId,
      title: videoInfo.title,
      primaryForwardingResult: forwardingResult,
      counterpartForwardingResult: counterpartForwardingResult,
      isN8nWebhook: isN8nWebhook
    });
  } catch (error) {
    console.error('[Vercel] Error handling notification for userKey:', userKey, error);
    return res.status(500).json({
      success: false,
      message: 'Error handling notification',
      error: error.message
    });
  }
} 