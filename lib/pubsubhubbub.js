/**
 * YouTube PubSubHubbub Helper Functions
 * 
 * This file contains helper functions for interacting with YouTube's PubSubHubbub hub.
 * These functions help with subscribing to YouTube channels and handling notifications.
 */

import axios from 'axios';
import querystring from 'querystring';
import crypto from 'crypto';

// YouTube PubSubHubbub hub URL
const YOUTUBE_HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';

/**
 * Generate a YouTube topic URL for a channel ID
 * 
 * This creates the URL that YouTube uses to identify a channel's Atom feed
 * 
 * @param {string} channelId - The YouTube channel ID
 * @returns {string} - The topic URL for the channel
 */
export function generateTopicUrl(channelId) {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Generate a unique user key for a webhook URL
 * 
 * This creates a unique identifier for each webhook URL that will be used in the callback URL
 * 
 * @param {string} webhookUrl - The webhook URL
 * @returns {string} - A unique user key
 */
export function generateUserKey(webhookUrl) {
  // Create a hash of the webhook URL to use as the user key
  return crypto.createHash('md5').update(webhookUrl).digest('hex').substring(0, 16);
}

/**
 * Generate a callback URL for a specific user key
 * 
 * This creates the URL that YouTube will call when a new video is published
 * 
 * @param {string} userKey - The unique user key
 * @returns {string} - The callback URL
 */
export function generateCallbackUrl(userKey) {
  // Always use the production domain for callback URLs
  const baseUrl = 'https://youtube-notifier.vercel.app';
  
  return `${baseUrl}/api/websub/${userKey}`;
}

/**
 * Subscribe to a YouTube channel via PubSubHubbub
 * 
 * This function sends a subscription request to YouTube's PubSubHubbub hub
 * for a specific channel ID, with a unique callback URL for the webhook.
 * 
 * @param {string} channelId - The YouTube channel ID to subscribe to
 * @param {string} webhookUrl - The webhook URL where notifications will be forwarded
 * @param {string} userKey - The unique user key for this webhook URL
 * @param {number} leaseSeconds - How long the subscription should last (in seconds)
 * @returns {Promise<object>} - The response from YouTube's hub
 */
export async function subscribeToChannel(channelId, webhookUrl, userKey, leaseSeconds = 864000) { // Default to 10 days
  // Generate the topic URL for this channel
  const topicUrl = generateTopicUrl(channelId);
  
  // Generate the callback URL for this user key
  const callbackUrl = generateCallbackUrl(userKey);
  
  // Log the subscription attempt
  console.log(`Attempting to subscribe to channel ${channelId} with callback ${callbackUrl} for webhook ${webhookUrl}`);
  
  // Create the form data for the POST request
  const formData = {
    'hub.callback': callbackUrl,
    'hub.mode': 'subscribe',
    'hub.topic': topicUrl,
    'hub.verify': 'sync', // Can be 'sync' or 'async'
    'hub.lease_seconds': leaseSeconds
  };
  
  try {
    // Send the POST request to YouTube's hub
    const response = await axios.post(
      YOUTUBE_HUB_URL,
      querystring.stringify(formData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Log the successful subscription
    console.log(`Successfully subscribed to ${channelId}:`, {
      statusCode: response.status,
      data: response.data,
      callbackUrl,
      webhookUrl
    });
    
    return {
      success: true,
      channelId,
      statusCode: response.status,
      data: response.data,
      callbackUrl,
      webhookUrl
    };
  } catch (error) {
    // Log the error
    console.error(`Error subscribing to ${channelId}:`, error.message);
    
    // Return error details
    return {
      success: false,
      channelId,
      error: error.message,
      callbackUrl,
      webhookUrl,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    };
  }
}

/**
 * Subscribe to multiple YouTube channels
 * 
 * This function subscribes to multiple channels in parallel
 * 
 * @param {string[]} channelIds - Array of YouTube channel IDs
 * @param {string} webhookUrl - The webhook URL where notifications will be forwarded
 * @param {string} userKey - The unique user key for this webhook URL
 * @param {number} leaseSeconds - How long the subscription should last (in seconds)
 * @returns {Promise<object[]>} - Array of responses from YouTube's hub
 */
export async function subscribeToChannels(channelIds, webhookUrl, userKey, leaseSeconds = 864000) {
  // Create an array of promises for each subscription request
  const subscriptionPromises = channelIds.map(channelId => 
    subscribeToChannel(channelId, webhookUrl, userKey, leaseSeconds)
  );
  
  // Execute all subscription requests in parallel
  return Promise.all(subscriptionPromises);
}

/**
 * Unsubscribe from a YouTube channel
 * 
 * This function sends an unsubscribe request to YouTube's PubSubHubbub hub
 * 
 * @param {string} channelId - The YouTube channel ID to unsubscribe from
 * @param {string} webhookUrl - The webhook URL where notifications were being forwarded
 * @param {string} userKey - The unique user key for this webhook URL
 * @returns {Promise<object>} - The response from YouTube's hub
 */
export async function unsubscribeFromChannel(channelId, webhookUrl, userKey) {
  // Generate the topic URL for this channel
  const topicUrl = generateTopicUrl(channelId);
  
  // Generate the callback URL for this user key
  const callbackUrl = generateCallbackUrl(userKey);
  
  // Create the form data for the POST request
  const formData = {
    'hub.callback': callbackUrl,
    'hub.mode': 'unsubscribe',
    'hub.topic': topicUrl,
    'hub.verify': 'sync'
  };
  
  try {
    // Send the POST request to YouTube's hub
    const response = await axios.post(
      YOUTUBE_HUB_URL,
      querystring.stringify(formData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Log the successful unsubscription
    console.log(`Successfully unsubscribed from ${channelId}`);
    
    return {
      success: true,
      channelId,
      statusCode: response.status,
      data: response.data,
      callbackUrl,
      webhookUrl
    };
  } catch (error) {
    // Log the error
    console.error(`Error unsubscribing from ${channelId}:`, error.message);
    
    // Return error details
    return {
      success: false,
      channelId,
      error: error.message,
      callbackUrl,
      webhookUrl,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    };
  }
} 