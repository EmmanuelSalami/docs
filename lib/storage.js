/**
 * Storage Helper Functions using Upstash Redis
 * 
 * This file contains helper functions for reading and writing subscription data
 * using Upstash Redis as the storage backend.
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client with environment variables
const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL,
  token: process.env.STORAGE_KV_REST_API_TOKEN,
});

// Key for storing all subscriptions in Redis
const SUBSCRIPTIONS_KEY = 'youtube_subscriptions';

/**
 * Get all subscriptions from Redis storage
 * 
 * @returns {Promise<Array>} Array of subscription objects
 */
export async function getSubscriptions() {
  try {
    // Get subscriptions from Redis, default to empty array if not found
    const subscriptions = await redis.get(SUBSCRIPTIONS_KEY);
    return subscriptions || [];
  } catch (error) {
    console.error('[Redis] Error reading subscriptions:', error);
    return [];
  }
}

/**
 * Save subscriptions to Redis storage
 * 
 * @param {Array} subscriptions - Array of subscription objects to save
 * @returns {Promise<boolean>} True if save was successful, false otherwise
 */
export async function saveSubscriptions(subscriptions) {
  try {
    await redis.set(SUBSCRIPTIONS_KEY, subscriptions);
    return true;
  } catch (error) {
    console.error('[Redis] Error saving subscriptions:', error);
    return false;
  }
}

/**
 * Add a new subscription to storage
 * 
 * @param {Object} subscription - Subscription object to add
 * @returns {Promise<boolean>} True if addition was successful, false otherwise
 */
export async function addSubscription(subscription) {
  try {
    const subscriptions = await getSubscriptions();
    subscriptions.push(subscription);
    return await saveSubscriptions(subscriptions);
  } catch (error) {
    console.error('[Redis] Error adding subscription:', error);
    return false;
  }
}

/**
 * Update an existing subscription in storage
 * 
 * @param {string} userKey - The unique user key of the subscription to update
 * @param {Object} updatedSubscription - The new subscription data
 * @returns {Promise<boolean>} True if update was successful, false otherwise
 */
export async function updateSubscription(userKey, updatedSubscription) {
  try {
    const subscriptions = await getSubscriptions();
    const index = subscriptions.findIndex(sub => sub.userKey === userKey);
    
    if (index === -1) {
      console.error(`[Redis] Subscription with userKey ${userKey} not found`);
      return false;
    }
    
    subscriptions[index] = updatedSubscription;
    return await saveSubscriptions(subscriptions);
  } catch (error) {
    console.error('[Redis] Error updating subscription:', error);
    return false;
  }
}

/**
 * Find subscriptions by channel ID
 * 
 * @param {string} channelId - YouTube channel ID to search for
 * @returns {Promise<Array>} Array of subscription objects that include the channel ID
 */
export async function findSubscriptionsByChannelId(channelId) {
  try {
    const subscriptions = await getSubscriptions();
    return subscriptions.filter(sub => 
      sub.channelIds && sub.channelIds.includes(channelId)
    );
  } catch (error) {
    console.error('[Redis] Error finding subscriptions by channel ID:', error);
    return [];
  }
}

/**
 * Find a subscription by user key
 * 
 * @param {string} userKey - Unique user key to search for
 * @returns {Promise<Object|null>} Subscription object if found, null otherwise
 */
export async function findSubscriptionByUserKey(userKey) {
  try {
    const subscriptions = await getSubscriptions();
    return subscriptions.find(sub => sub.userKey === userKey) || null;
  } catch (error) {
    console.error('[Redis] Error finding subscription by user key:', error);
    return null;
  }
} 