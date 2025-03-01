/**
 * YouTube Channel Unsubscribe API Endpoint
 * 
 * This API endpoint allows users to unsubscribe from YouTube channels.
 * It receives a webhook URL and optionally channel IDs or an allChannels flag, then:
 * 1. Finds the subscription in our data store
 * 2. Sends unsubscribe requests to YouTube's PubSubHubbub hub
 * 3. Updates or removes the subscription from our data store
 * 
 * Steps:
 * 1. Validate the incoming request (must be POST with required fields)
 * 2. Find the subscription by webhook URL
 * 3. Determine which channels to unsubscribe from
 * 4. Send unsubscribe requests to YouTube's PubSubHubbub hub
 * 5. Update or remove the subscription from our data store
 * 6. Return a success response with the unsubscription status
 */

import { findSubscriptionByUserKey, getSubscriptions, saveSubscriptions, updateSubscription } from '../../lib/storage';
import { unsubscribeFromChannel, generateUserKey } from '../../lib/pubsubhubbub';

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
 * Checks if a webhook URL is a test URL (contains 'webhook-test')
 * 
 * @param {string} webhookUrl - The webhook URL to check
 * @returns {boolean} - True if it's a test webhook URL, false otherwise
 */
function isTestWebhook(webhookUrl) {
  return webhookUrl && typeof webhookUrl === 'string' && webhookUrl.includes('webhook-test');
}

/**
 * Checks if a webhook URL is a production URL (contains 'webhook' but not 'webhook-test')
 * 
 * @param {string} webhookUrl - The webhook URL to check
 * @returns {boolean} - True if it's a production webhook URL, false otherwise
 */
function isProductionWebhook(webhookUrl) {
  return webhookUrl && 
         typeof webhookUrl === 'string' && 
         webhookUrl.includes('webhook') && 
         !webhookUrl.includes('webhook-test');
}

/**
 * Checks if a webhook URL is an N8N webhook (contains either 'webhook' or 'webhook-test')
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
 * Converts a production webhook URL to its test equivalent
 * For N8N, this means changing 'webhook' to 'webhook-test'
 * 
 * @param {string} webhookUrl - The webhook URL to convert
 * @returns {string|null} - The test webhook URL, or null if not a production URL
 */
function getTestWebhookUrl(webhookUrl) {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return null;
  }
  
  // Check if this is a production webhook URL (contains 'webhook' but not 'webhook-test')
  if (webhookUrl.includes('webhook') && !webhookUrl.includes('webhook-test')) {
    // Replace 'webhook' with 'webhook-test' to get the test URL
    return webhookUrl.replace('webhook', 'webhook-test');
  }
  
  // If it's not a production webhook URL, return null
  return null;
}

/**
 * Main API handler function for the /api/unsubscribe endpoint
 * 
 * @param {object} req - The HTTP request object
 * @param {object} res - The HTTP response object
 */
export default async function handler(req, res) {
  // Log initial request details for Vercel debugging
  console.log('[Vercel] Unsubscribe API called:', {
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
    const { webhookUrl, channelIds, allChannels } = req.body || {};
    console.log('[Vercel] Request body:', { webhookUrl, channelIds, allChannels });

    // Step 3: Validate webhookUrl (must be a valid URL)
    if (!webhookUrl || !isValidUrl(webhookUrl)) {
      console.log('[Vercel] Invalid webhookUrl:', webhookUrl);
      return res.status(400).json({ 
        success: false, 
        message: 'webhookUrl must be a valid URL' 
      });
    }

    // Step 4: Find the subscription by webhook URL
    const subscription = await findSubscriptionByWebhook(webhookUrl);
    if (!subscription) {
      console.log('[Vercel] No subscription found for webhook URL:', webhookUrl);
      return res.status(404).json({
        success: false,
        message: 'No subscription found for the provided webhook URL',
        webhookUrl
      });
    }

    // Step 5: Determine which channels to unsubscribe from
    let channelsToUnsubscribe = [];
    
    if (allChannels === true) {
      // Unsubscribe from all channels
      channelsToUnsubscribe = [...subscription.channelIds];
    } else if (channelIds && Array.isArray(channelIds) && channelIds.length > 0) {
      // Validate each channel ID format
      const invalidChannelIds = channelIds.filter(id => !isValidYouTubeChannelId(id));
      if (invalidChannelIds.length > 0) {
        console.log('[Vercel] Invalid YouTube channel IDs detected:', invalidChannelIds);
        return res.status(400).json({
          success: false,
          message: 'One or more channel IDs are not in the correct YouTube format',
          invalidChannelIds
        });
      }
      
      // Filter to only include channel IDs that are actually in the subscription
      channelsToUnsubscribe = channelIds.filter(id => subscription.channelIds.includes(id));
      
      // If none of the provided channel IDs are in the subscription, return an error
      if (channelsToUnsubscribe.length === 0) {
        console.log('[Vercel] None of the provided channel IDs are in the subscription:', channelIds);
        return res.status(400).json({
          success: false,
          message: 'None of the provided channel IDs are in the subscription',
          webhookUrl,
          providedChannelIds: channelIds,
          subscribedChannelIds: subscription.channelIds
        });
      }
    } else {
      // Neither allChannels nor valid channelIds provided
      console.log('[Vercel] No channels specified for unsubscription');
      return res.status(400).json({
        success: false,
        message: 'You must specify either channelIds (array) or allChannels (true) to unsubscribe',
        webhookUrl
      });
    }

    // Step 6: Check if this is an N8N webhook and get the counterpart URL
    const isN8n = isN8nWebhook(webhookUrl);
    let counterpartWebhookUrl = null;
    
    if (isN8n) {
      if (isTestWebhook(webhookUrl)) {
        // If this is a test webhook, get the production counterpart
        counterpartWebhookUrl = getProductionWebhookUrl(webhookUrl);
        console.log('[Vercel] Test webhook URL detected. Will also unsubscribe from production URL:', counterpartWebhookUrl);
      } else if (isProductionWebhook(webhookUrl)) {
        // If this is a production webhook, get the test counterpart
        counterpartWebhookUrl = getTestWebhookUrl(webhookUrl);
        console.log('[Vercel] Production webhook URL detected. Will also unsubscribe from test URL:', counterpartWebhookUrl);
      }
    }

    // Step 7: Process the main webhook URL unsubscription
    const mainUnsubscriptionResult = await processUnsubscription(channelsToUnsubscribe, webhookUrl, subscription);
    
    // If this is an N8N webhook, also unsubscribe from the counterpart webhook
    let counterpartUnsubscriptionResult = null;
    if (isN8n && counterpartWebhookUrl) {
      console.log('[Vercel] Unsubscribing from counterpart webhook URL:', counterpartWebhookUrl);
      const counterpartSubscription = await findSubscriptionByWebhook(counterpartWebhookUrl);
      if (counterpartSubscription) {
        counterpartUnsubscriptionResult = await processUnsubscription(
          channelsToUnsubscribe.filter(id => counterpartSubscription.channelIds.includes(id)),
          counterpartWebhookUrl,
          counterpartSubscription
        );
      } else {
        console.log('[Vercel] No subscription found for counterpart webhook URL:', counterpartWebhookUrl);
      }
    }
    
    // Return the response based on the main unsubscription
    const response = {
      ...mainUnsubscriptionResult,
      dualUnsubscription: isN8n && counterpartWebhookUrl && counterpartUnsubscriptionResult ? {
        counterpartWebhookUrl,
        success: counterpartUnsubscriptionResult.success,
        message: counterpartUnsubscriptionResult.message,
        unsubscribedChannels: counterpartUnsubscriptionResult.unsubscribedChannels,
        unsubscriptionResults: counterpartUnsubscriptionResult.unsubscriptionResults,
        remainingChannels: counterpartUnsubscriptionResult.remainingChannels
      } : null
    };
    
    return res.status(200).json(response);
  } catch (error) {
    // Handle any unexpected errors
    console.error('[Vercel] Error processing unsubscription:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: error.message
    });
  }
}

/**
 * Process an unsubscription for a specific webhook URL
 * This function handles the logic of unsubscribing from channels and updating the subscription
 * 
 * @param {string[]} channelsToUnsubscribe - Array of YouTube channel IDs to unsubscribe from
 * @param {string} webhookUrl - The webhook URL
 * @param {object} subscription - The existing subscription object
 * @returns {Promise<object>} - The result of the unsubscription process
 */
async function processUnsubscription(channelsToUnsubscribe, webhookUrl, subscription) {
  // Step 1: Send unsubscribe requests to YouTube's PubSubHubbub hub
  console.log('[Vercel] Unsubscribing from YouTube PubSubHubbub for channels:', channelsToUnsubscribe);
  
  // Get the user key from the subscription
  const userKey = subscription.userKey;
  
  // Send unsubscribe requests to YouTube for each channel
  const unsubscriptionPromises = channelsToUnsubscribe.map(channelId => 
    unsubscribeFromChannel(channelId, webhookUrl, userKey)
  );
  
  // Execute all unsubscribe requests in parallel
  const unsubscriptionResults = await Promise.all(unsubscriptionPromises);
  
  // Log the results
  console.log('[Vercel] YouTube unsubscription results:', unsubscriptionResults);
  
  // Check if any unsubscriptions failed
  const failedUnsubscriptions = unsubscriptionResults.filter(result => !result.success);
  if (failedUnsubscriptions.length > 0) {
    console.warn('[Vercel] Some YouTube unsubscriptions failed:', failedUnsubscriptions);
  }
  
  // Step 2: Update the subscription in our data store
  // Calculate the remaining channel IDs after unsubscription
  const remainingChannelIds = subscription.channelIds.filter(id => !channelsToUnsubscribe.includes(id));
  
  let success = true;
  let message = '';
  
  if (remainingChannelIds.length === 0) {
    // If no channels remain, remove the subscription entirely
    console.log('[Vercel] Removing subscription for webhook URL as no channels remain:', webhookUrl);
    
    // Get all subscriptions
    const subscriptions = await getSubscriptions();
    
    // Filter out the subscription to remove
    const updatedSubscriptions = subscriptions.filter(sub => sub.userKey !== userKey);
    
    // Save the updated subscriptions list
    success = await saveSubscriptions(updatedSubscriptions);
    message = 'Unsubscribed from all channels and removed subscription';
  } else {
    // If some channels remain, update the subscription
    console.log('[Vercel] Updating subscription for webhook URL with remaining channels:', webhookUrl, remainingChannelIds);
    
    // Update the subscription with the remaining channel IDs
    const updatedSubscription = {
      ...subscription,
      channelIds: remainingChannelIds,
      timestamp: new Date().toISOString() // Update the timestamp
    };
    
    // Save the updated subscription
    success = await updateSubscription(userKey, updatedSubscription);
    message = 'Unsubscribed from specified channels';
  }
  
  // Check if the operation was successful
  if (!success) {
    console.error('[Vercel] Failed to update/remove subscription for webhook URL:', webhookUrl);
    return { 
      success: false, 
      message: 'Failed to update/remove subscription',
      webhookUrl,
      unsubscribedChannels: channelsToUnsubscribe,
      unsubscriptionResults
    };
  }
  
  // Return a success response with details
  return {
    success: true,
    message,
    webhookUrl,
    unsubscribedChannels: channelsToUnsubscribe,
    unsubscriptionResults,
    remainingChannels: remainingChannelIds
  };
} 