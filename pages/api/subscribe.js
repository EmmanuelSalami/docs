/**
 * YouTube Channel Subscription API Endpoint
 * 
 * This API endpoint allows users to subscribe to YouTube channels.
 * It receives channel IDs and a webhook URL, then:
 * 1. Stores this information in our data store
 * 2. Sends subscription requests to YouTube's PubSubHubbub hub
 * 
 * Steps:
 * 1. Validate the incoming request (must be POST with required fields)
 * 2. Generate a unique user key for this subscription or use existing one if webhook exists
 * 3. Store the subscription details in our data store
 * 4. Send subscription requests to YouTube's PubSubHubbub hub
 * 5. Return a success response with the user key and subscription status
 */

import { v4 as uuidv4 } from 'uuid';
import { addSubscription, findSubscriptionsByChannelId, getSubscriptions, updateSubscription } from '../../lib/storage';
import { subscribeToChannels, generateUserKey } from '../../lib/pubsubhubbub';

// Configure export to handle API requests
export const config = {
  api: {
    bodyParser: true,
  },
};

/**
 * Validates if a string is a properly formatted URL
 * 
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if the URL is valid, false otherwise
 */
function isValidUrl(url) {
  try {
    // Create a URL object - this will throw an error if the URL is invalid
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validates if a string looks like a YouTube channel ID
 * YouTube channel IDs typically start with 'UC' and are 24 characters long
 * 
 * @param {string} channelId - The channel ID to validate
 * @returns {boolean} - True if the channel ID format is valid, false otherwise
 */
function isValidYouTubeChannelId(channelId) {
  // Basic validation: Channel IDs typically start with 'UC' and are 24 characters long
  return typeof channelId === 'string' && 
         channelId.startsWith('UC') && 
         channelId.length === 24;
}

/**
 * Finds an existing subscription by webhook URL
 * 
 * @param {string} webhookUrl - The webhook URL to check
 * @returns {Promise<object|null>} - The subscription object if found, null otherwise
 */
async function findSubscriptionByWebhook(webhookUrl) {
  const subscriptions = await getSubscriptions();
  return subscriptions.find(sub => sub.webhookUrl === webhookUrl) || null;
}

/**
 * Constructs the callback URL for YouTube to send notifications to
 * 
 * @param {object} req - The HTTP request object
 * @returns {string} - The full callback URL
 */
function getCallbackUrl(req) {
  // Use the permanent URL instead of the dynamic one from request headers
  return 'https://youtube-notifier.vercel.app/api/websub';
}

/**
 * Converts a test webhook URL to its production equivalent
 * For N8N, this means changing 'webhook-test' to 'webhook'
 * 
 * @param {string} webhookUrl - The webhook URL to convert
 * @returns {string|null} - The production webhook URL, or null if not a test URL
 */
function getProductionWebhookUrl(webhookUrl) {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return null;
  }
  
  // Check if this is a test webhook URL (contains 'webhook-test')
  if (webhookUrl.includes('webhook-test')) {
    // Replace 'webhook-test' with 'webhook' to get the production URL
    return webhookUrl.replace('webhook-test', 'webhook');
  }
  
  // If it's not a test webhook URL, return null
  return null;
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
 * Main API handler function for the /api/subscribe endpoint
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 */
export default async function handler(req, res) {
  // Log initial request details for Vercel debugging
  console.log('[Vercel] Subscribe API called:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
    host: req.headers.host,
    protocol: req.headers['x-forwarded-proto']
  });

  try {
    // Step 1: Check if the request method is POST
    if (req.method !== 'POST') {
      console.log('[Vercel] Invalid method:', req.method);
      return res.status(405).json({ 
        success: false, 
        message: 'Method not allowed. Please use POST.' 
      });
    }

    // Step 2: Extract and validate the request body
    const { channelIds, webhookUrl } = req.body || {};
    console.log('[Vercel] Request body:', { channelIds, webhookUrl });

    // Step 3: Validate channelIds (must be a non-empty array)
    if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
      console.log('[Vercel] Invalid channelIds:', channelIds);
      return res.status(400).json({ 
        success: false, 
        message: 'channelIds must be a non-empty array of YouTube channel IDs' 
      });
    }

    // Step 4: Validate each channel ID format
    const invalidChannelIds = channelIds.filter(id => !isValidYouTubeChannelId(id));
    if (invalidChannelIds.length > 0) {
      console.log('[Vercel] Invalid YouTube channel IDs detected:', invalidChannelIds);
      return res.status(400).json({
        success: false,
        message: 'One or more channel IDs are not in the correct YouTube format',
        invalidChannelIds
      });
    }

    // Step 5: Validate webhookUrl (must be a valid URL)
    if (!webhookUrl || !isValidUrl(webhookUrl)) {
      console.log('[Vercel] Invalid webhookUrl:', webhookUrl);
      return res.status(400).json({ 
        success: false, 
        message: 'webhookUrl must be a valid URL' 
      });
    }

    // Check if this is a test webhook URL and get the production equivalent
    const isTestUrl = isTestWebhook(webhookUrl);
    const productionWebhookUrl = isTestUrl ? getProductionWebhookUrl(webhookUrl) : null;
    
    if (isTestUrl && productionWebhookUrl) {
      console.log('[Vercel] Test webhook URL detected. Will also create subscription for production URL:', productionWebhookUrl);
    }

    // Step 6: Process the main webhook URL subscription
    const mainSubscriptionResult = await processSubscription(channelIds, webhookUrl, req);
    
    // If this is a test webhook, also create a subscription for the production webhook
    let productionSubscriptionResult = null;
    if (isTestUrl && productionWebhookUrl) {
      console.log('[Vercel] Creating additional subscription for production webhook URL:', productionWebhookUrl);
      productionSubscriptionResult = await processSubscription(channelIds, productionWebhookUrl, req);
    }
    
    // Return the response based on the main subscription
    const response = {
      ...mainSubscriptionResult,
      dualSubscription: isTestUrl && productionWebhookUrl ? {
        productionWebhookUrl,
        success: productionSubscriptionResult ? productionSubscriptionResult.success : false,
        userKey: productionSubscriptionResult ? productionSubscriptionResult.userKey : null,
        message: productionSubscriptionResult ? productionSubscriptionResult.message : 'Failed to create production webhook subscription',
        ...(productionSubscriptionResult && productionSubscriptionResult.newlySubscribedChannels ? { 
          newlySubscribedChannels: productionSubscriptionResult.newlySubscribedChannels 
        } : {}),
        ...(productionSubscriptionResult && productionSubscriptionResult.resubscribedChannels ? { 
          resubscribedChannels: productionSubscriptionResult.resubscribedChannels,
          resubscriptionResults: productionSubscriptionResult.resubscriptionResults
        } : {})
      } : null
    };
    
    return res.status(200).json(response);
  } catch (error) {
    // Handle any unexpected errors
    console.error('[Vercel] Error processing subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: error.message
    });
  }
}

/**
 * Process a subscription for a specific webhook URL
 * This function handles the logic of creating or updating a subscription
 * 
 * @param {string[]} channelIds - Array of YouTube channel IDs to subscribe to
 * @param {string} webhookUrl - The webhook URL to send notifications to
 * @param {object} req - The HTTP request object (for getting callback URL)
 * @returns {Promise<object>} - The result of the subscription process
 */
async function processSubscription(channelIds, webhookUrl, req) {
  // Step 1: Check if the webhook URL already exists
  const existingSubscription = await findSubscriptionByWebhook(webhookUrl);
  console.log('[Vercel] Existing subscription for', webhookUrl, ':', existingSubscription);
  
  // Variables to track the operation result
  let userKey;
  let success;
  let newlySubscribedChannels = [];
  let resubscribedChannels = [];
  let resubscriptionResults = [];
  
  if (existingSubscription) {
    // If the webhook already exists, update the existing subscription
    console.log('[Vercel] Found existing subscription for webhook URL:', webhookUrl);
    
    // Determine which channels are new and which are already subscribed
    userKey = existingSubscription.userKey;
    
    // Filter out channel IDs that are already in the subscription
    newlySubscribedChannels = channelIds.filter(id => !existingSubscription.channelIds.includes(id));
    resubscribedChannels = channelIds.filter(id => existingSubscription.channelIds.includes(id));
    
    // Update the subscription with the new channel IDs
    const updatedChannelIds = [...new Set([...existingSubscription.channelIds, ...newlySubscribedChannels])];
    const updatedSubscription = {
      ...existingSubscription,
      channelIds: updatedChannelIds,
      timestamp: new Date().toISOString() // Update the timestamp
    };
    
    console.log('[Vercel] Updating subscription with new channels for webhook URL:', webhookUrl, newlySubscribedChannels);
    success = await updateSubscription(userKey, updatedSubscription);
  } else {
    // If the webhook doesn't exist, create a new subscription
    // Generate a unique user key based on the webhook URL
    userKey = generateUserKey(webhookUrl);
    
    // Create the subscription object with all required fields
    const subscription = {
      userKey,
      channelIds,
      webhookUrl,
      timestamp: new Date().toISOString()
    };

    // Log the subscription we're about to save
    console.log('[Vercel] Creating new subscription for webhook URL:', webhookUrl, subscription);
    
    // Store the subscription in our data store
    success = await addSubscription(subscription);
    
    // All channels are newly subscribed
    newlySubscribedChannels = channelIds;
  }

  // Check if the operation was successful
  if (!success) {
    console.error('[Vercel] Failed to save/update subscription for webhook URL:', webhookUrl);
    return { 
      success: false, 
      message: 'Failed to save/update subscription',
      webhookUrl
    };
  }

  // Step 7: Subscribe to YouTube's PubSubHubbub hub for new channels
  if (newlySubscribedChannels.length > 0) {
    console.log('[Vercel] Subscribing to YouTube PubSubHubbub for new channels for webhook URL:', webhookUrl, newlySubscribedChannels);
    
    // Send subscription requests to YouTube using the userKey for the unique callback URL
    const subscriptionResults = await subscribeToChannels(newlySubscribedChannels, webhookUrl, userKey);
    
    // Log the results
    console.log('[Vercel] YouTube subscription results for new channels for webhook URL:', webhookUrl, subscriptionResults);
    
    // Check if any subscriptions failed
    const failedSubscriptions = subscriptionResults.filter(result => !result.success);
    if (failedSubscriptions.length > 0) {
      console.warn('[Vercel] Some YouTube subscriptions failed for webhook URL:', webhookUrl, failedSubscriptions);
    }
  }

  // Step 8: Resubscribe to existing channels to refresh their subscriptions
  if (resubscribedChannels.length > 0) {
    console.log('[Vercel] Resubscribing to YouTube PubSubHubbub for existing channels for webhook URL:', webhookUrl, resubscribedChannels);
    
    // Send subscription requests to YouTube for existing channels (resubscribe) using the userKey
    resubscriptionResults = await subscribeToChannels(resubscribedChannels, webhookUrl, userKey);
    
    // Log the results
    console.log('[Vercel] YouTube resubscription results for webhook URL:', webhookUrl, resubscriptionResults);
    
    // Check if any resubscriptions failed
    const failedResubscriptions = resubscriptionResults.filter(result => !result.success);
    if (failedResubscriptions.length > 0) {
      console.warn('[Vercel] Some YouTube resubscriptions failed for webhook URL:', webhookUrl, failedResubscriptions);
    }
  }

  // Determine the appropriate message based on the operation
  let message;
  if (!existingSubscription) {
    message = 'Subscribed successfully';
  } else if (newlySubscribedChannels.length > 0 && resubscribedChannels.length > 0) {
    message = 'Subscription updated with new channels and existing channels resubscribed';
  } else if (newlySubscribedChannels.length > 0) {
    message = 'Subscription updated successfully';
  } else {
    message = 'All channels have been resubscribed';
  }

  // Return a success response with the user key and other details
  console.log('[Vercel] Subscription saved/updated successfully for webhook URL:', webhookUrl, 'with userKey:', userKey);
  
  const response = {
    success: true,
    userKey,
    message,
    webhookUrl
  };

  // Add newly subscribed channels if there are any
  if (newlySubscribedChannels.length > 0) {
    response.newlySubscribedChannels = newlySubscribedChannels;
  }

  // Add resubscribed channels and results if there are any
  if (resubscribedChannels.length > 0) {
    response.resubscribedChannels = resubscribedChannels;
    response.resubscriptionResults = resubscriptionResults;
  }

  return response;
} 