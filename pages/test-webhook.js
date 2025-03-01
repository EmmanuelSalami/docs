import { useState } from 'react';
import Head from 'next/head';

/**
 * Test Webhook Page
 * 
 * This page allows users to test their webhook endpoints by sending
 * a simplified YouTube notification data object.
 */
export default function TestWebhook() {
  // State for the webhook URL input
  const [webhookUrl, setWebhookUrl] = useState('');
  
  // State for the test results
  const [testResult, setTestResult] = useState(null);
  
  // State for loading status
  const [isLoading, setIsLoading] = useState(false);
  
  // State for error message
  const [error, setError] = useState('');

  // 1) Define your *single-object* mock data (no array).
  //    This matches the shape you want in N8N:
  const mockData = {
    headers: {
      "host": "velto.app.n8n.cloud",
      "user-agent": "axios/1.8.1",
      "content-type": "application/json",
    },
    params: {},
    query: {},
    body: {
      event: "youtube.video.published",
      video: {
        id: "Tb2YL-aCg7c",
        title: "AI Solution Demo",
        url: "https://www.youtube.com/watch?v=Tb2YL-aCg7c",
        published_at: "2025-02-28T23:58:41+00:00",
        updated_at: "2025-02-28T23:59:32.182345149+00:00",
      },
      channel: {
        id: "UC1PsYPhJWpgcM88C4txYp1Q",
        name: "Crazy Clones AI",
      },
      // Just for example, set a timestamp to "now"
      timestamp: new Date().toISOString(),
    },
    webhookUrl: "https://your-webhook-url.com",
    executionMode: "production",
  };

  /**
   * Handles the form submission to test the webhook
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset previous results and errors
    setTestResult(null);
    setError('');
    
    // Validate webhook URL
    if (!webhookUrl) {
      setError('Please enter a webhook URL');
      return;
    }
    
    try {
      setIsLoading(true);

      // 2) Send this single-object mockData to your API (which then forwards it)
      const response = await fetch('/api/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // We pass both the user-specified webhookUrl and the mockData
        body: JSON.stringify({ webhookUrl, mockData }),
      });
      
      // Parse the response
      const data = await response.json();
      
      // Handle success or error
      if (response.ok) {
        setTestResult({
          success: true,
          message: data.message,
          statusCode: data.statusCode,
          responseData: data.responseData,
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || 'Failed to send test notification',
          statusCode: data.statusCode,
          responseData: data.responseData,
        });
      }
    } catch (err) {
      console.error('Error testing webhook:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Copies the mock data JSON to clipboard
   */
  const copyMockData = () => {
    navigator.clipboard.writeText(JSON.stringify(mockData, null, 2));
    alert('Mock data copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Head>
        <title>Test Webhook - YouTube Notification System</title>
        <meta
          name="description"
          content="Test your webhook endpoint with mock YouTube notification data"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-purple-700 dark:text-purple-400 mb-2">
              Test Your Webhook
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Send mock YouTube notification data to your webhook endpoint to verify it&apos;s working correctly.
            </p>
          </div>

          {/* Form Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label
                  htmlFor="webhookUrl"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Webhook URL
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="url"
                    id="webhookUrl"
                    name="webhookUrl"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-webhook-url.com"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isLoading ? 'Sending...' : 'Send Test'}
                  </button>
                </div>
                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </form>
          </div>
          
          {/* Results Section */}
          {testResult && (
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 border-l-4 ${
              testResult.success ? 'border-green-500' : 'border-red-500'
            }`}>
              <h2 className="text-xl font-semibold mb-2">
                {testResult.success ? 'Success!' : 'Error'}
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                {testResult.message}
              </p>
              {testResult.statusCode && (
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                  Status Code: {testResult.statusCode}
                </p>
              )}
              {testResult.responseData && (
                <div className="mt-4">
                  <h3 className="text-md font-medium mb-2">Response Data:</h3>
                  <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md overflow-x-auto text-sm">
                    {JSON.stringify(testResult.responseData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          
          {/* Instructions Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">How It Works</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              This tool sends a mock YouTube notification to your webhook endpoint. The notification simulates what would be sent when a new video is published on a subscribed channel.
            </p>
            
            <h3 className="text-lg font-medium mb-2">N8N Integration</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you're using N8N, you can access the notification data in your workflow using these expressions. We support two formats:
            </p>
            
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md mb-4">
              <h4 className="text-sm font-semibold mb-2">Format 1 (Bracket Notation):</h4>
              <p className="text-sm font-mono mb-2">Video Title: {'{{ $json["body"]["video"]["title"] }}'}</p>
              <p className="text-sm font-mono mb-2">Video URL: {'{{ $json["body"]["video"]["url"] }}'}</p>
              <p className="text-sm font-mono mb-2">Channel Name: {'{{ $json["body"]["channel"]["name"] }}'}</p>
              <p className="text-sm font-mono mb-2">Published At: {'{{ $json["body"]["video"]["published_at"] }}'}</p>
              
              <h4 className="text-sm font-semibold mt-4 mb-2">Format 2 (Dot Notation):</h4>
              <p className="text-sm font-mono mb-2">Video Title: {'{{ $json.body.video.title }}'}</p>
              <p className="text-sm font-mono mb-2">Video URL: {'{{ $json.body.video.url }}'}</p>
              <p className="text-sm font-mono mb-2">Channel Name: {'{{ $json.body.channel.name }}'}</p>
              <p className="text-sm font-mono mb-2">Published At: {'{{ $json.body.video.published_at }}'}</p>
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Note:</strong> The notification is sent in two formats - once in an XML-like structure and once in a cleaner JSON format. Both expression formats above will work with the JSON format.
            </p>
            
            <h3 className="text-lg font-medium mb-2">Mock Data Format</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Here's the format of the mock data that will be sent:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md overflow-x-auto text-sm">
                {JSON.stringify(mockData, null, 2)}
              </pre>
              <button
                onClick={copyMockData}
                className="absolute top-2 right-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 text-xs py-1 px-2 rounded"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

