/**
 * /pages/api/test-webhook.js
 *
 * Sends a single object (no arrays, no "body" field)
 * so that in N8N you can use:
 *
 *   {{ $json["body"]["video"]["title"] }}
 *
 * Instead of double-nesting "body".
 */

import axios from 'axios';

/**
 * Validates a URL string
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 1) Your mock notification data as a SINGLE OBJECT,
//    with NO top-level "body" key.
const mockNotificationData = {
  // Put top-level fields exactly how you want them to appear in N8N:
  event: 'youtube.video.published',
  video: {
    id: 'yrYmQDh2rM8',
    title: 'real notification',
    url: 'https://www.youtube.com/watch?v=yrYmQDh2rM8',
    published_at: '2025-03-01T16:59:59+00:00',
    updated_at: '2025-03-01T17:00:00.310119404+00:00',
  },
  channel: {
    id: 'UC1PsYPhJWpgcM88C4txYp1Q',
    name: 'Crazy Clones AI',
  },
  timestamp: '2025-03-01T17:00:03.982Z',
};

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are allowed',
    });
  }

  try {
    const { webhookUrl } = req.body;

    // Validate webhook URL
    if (!webhookUrl || !isValidUrl(webhookUrl)) {
      return res.status(400).json({
        error: 'Invalid webhook URL',
        message: 'Please provide a valid webhook URL',
      });
    }

    // 2) Post this single object as the request body
    //    => N8N will store it under {{ $json["body"] }}:
    const axiosResponse = await axios.post(webhookUrl, mockNotificationData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10s timeout
    });

    return res.status(200).json({
      success: true,
      message: 'Test notification sent successfully',
      statusCode: axiosResponse.status,
      responseData: axiosResponse.data,
    });
  } catch (error) {
    console.error('Error sending test webhook:', error);
    return res.status(500).json({
      error: 'Failed to send test notification',
      message: error.message || 'An unknown error occurred',
      statusCode: error.response?.status,
      responseData: error.response?.data,
    });
  }
}
