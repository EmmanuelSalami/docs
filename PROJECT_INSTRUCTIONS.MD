# Implementation Plan

## Project Initialization & Structure

- [x] **Step 1: Confirm Project Structure & Dependencies**
  - **Task**: 
    1. ✅ Ensure that the Next.js project (with Page Router) is set up locally and is capable of serverless functions on Vercel.  
    2. ✅ Confirm `package.json` includes dependencies for handling webhooks (if needed) and file I/O for JSON storage.  
    3. ✅ Create a simple JSON file structure to store subscription data (e.g., `subscriptions.json`).
    4. ~~Add environment variables (e.g., for `VERCEL_URL` or secrets, if required) via `.env.local`.~~ (Not needed for this project)
  - **Files**:  
    - ✅ `package.json`: (Check if any needed packages, e.g., `fs-extra`, `uuid`, `axios` or `node-fetch`, and `fast-xml-parser` or `xml2js`, are installed; if not, list them to add)  
    - ✅ `data/subscriptions.json`: (Initialize an empty array here to store subscription data)
    - ✅ `lib/storage.js`: (Create helper functions for reading/writing subscription data)
  - **Step Dependencies**: None
  - **User Instructions**: 
    1. ✅ Confirm you have a Next.js (Page Router) project created with `npx create-next-app` or similar. 
    2. ✅ Install any missing dependencies (e.g., `npm install fs-extra uuid axios fast-xml-parser`) as identified.
    3. **Note for Production Deployment**: For production, replace the local file storage with Vercel KV or another persistent storage solution suitable for serverless environments.

---

## Core API Routes (Serverless Functions) – Part 1

- [x] **Step 2: Implement `/api/subscribe` Endpoint**
  - **Task**:
    1. ✅ Create a serverless function that handles POST requests to subscribe a user to given channel IDs.
    2. ✅ Validate incoming `channelIds` and `webhookUrl`.
    3. ✅ Generate a unique `userKey` (e.g., using `uuid`).
    4. ✅ Store the subscription details (`userKey`, `channelIds`, `webhookUrl`, `timestamp`) in `subscriptions.json`.
    5. ✅ Return the response JSON as specified:
       ```json
       {
         "success": true,
         "userKey": "...",
         "message": "Subscribed successfully",
         "newlySubscribedChannels": [...],
         "webhookUrl": "..."
       }
       ```
    6. ✅ (Do not call YouTube's PubSubHubbub yet. We're first just ensuring the endpoint works and data is stored.)
  - **Files**:
    - ✅ `pages/api/subscribe.js`: Implements the POST logic described above.
    - ✅ `lib/storage.js`: Helper file to handle reading/writing subscription data.
  - **Step Dependencies**: Step 1 (project setup).
  - **User Instructions**:
    1. After implementing, run locally via `npm run dev`.
    2. Test the API with Postman:
       - **URL**: `http://localhost:3000/api/subscribe`
       - **Method**: POST
       - **Body (JSON)**: 
         ```json
         {
           "channelIds": ["UC_x5XG1OV2P6uZZ5FSM9Ttw"],
           "webhookUrl": "https://example.com/my-webhook"
         }
         ```
       - Confirm you receive `success: true`, a `userKey`, etc.
       - Confirm `data/subscriptions.json` is updated.

---

- [x] **Step 3: Implement Basic Logging/Filtering (Optional)**
  - **Task**:
    1. ✅ Introduce an optional logging mechanism for requests in `/api/subscribe`, e.g., using `console.log`.
    2. ✅ Introduce basic validation checks (e.g., ensure `channelIds` is a non-empty array).
  - **Files**:
    - ✅ `pages/api/subscribe.js` – same file as Step 2, adding logs/validations.
  - **Step Dependencies**: Step 2
  - **User Instructions**:
    1. Re-deploy and test again with Postman to ensure validations/logging are functioning.

---

## Core API Routes (Serverless Functions) – Part 2

- [x] **Step 4: Implement `/api/websub` Endpoint (Webhook Receiver)**
  - **Task**: 
    1. ✅ Create a serverless function for `POST /api/websub`.
    2. ✅ This endpoint will ultimately receive notifications from YouTube. For now, simply parse the request body and log it.
    3. ✅ We will add the forwarding logic to N8N in a later step, but first let's confirm the endpoint can receive data.
    4. ✅ Return a simple response indicating "Webhook received".
  - **Files**:
    - ✅ `pages/api/websub.js`: Basic receiver logic.
  - **Step Dependencies**: Step 1
  - **User Instructions**: 
    1. Deploy again to Vercel (or run locally).
    2. Test with Postman:
       - **URL**: `[your-vercel-or-local-url]/api/websub`
       - **Method**: POST
       - **Body**: Some test JSON (e.g. `{"test": true}`)
       - Confirm you receive a success message (or "Webhook received").
       - Check logs to ensure it's capturing the data.

---

## Integrating YouTube PubSubHubbub Logic

- [x] **Step 5: Enhance `/api/subscribe` to Trigger YouTube Subscription Requests**
  - **Task**:
    1. ✅ Now that we have the basic `/api/subscribe` storing data, we must also call YouTube's PubSubHubbub hub to subscribe.  
    2. ✅ Implement the logic to send an HTTP request to the PubSubHubbub endpoint (https://pubsubhubbub.appspot.com/subscribe).  
    3. ✅ Provide required parameters (`hub.mode=subscribe`, `hub.topic`, `hub.callback`, etc.).  
    4. ✅ Make sure you handle success/failure from YouTube.  
    5. ✅ We also need to handle YouTube's mandatory "Verification" GET request on `/api/websub` (YouTube calls it with `hub.challenge`). So, expand that endpoint to handle GET queries that confirm subscription.
  - **Files**:
    - ✅ `pages/api/subscribe.js`: Added code that calls the YouTube PubSubHubbub endpoint.
    - ✅ `pages/api/websub.js`: Added GET handling to respond to `hub.challenge` if present.
    - ✅ `lib/pubsubhubbub.js`: Created helper functions for PubSubHubbub operations.
  - **Step Dependencies**: Steps 2 & 4
  - **User Instructions**: 
    1. Deploy to Vercel for partial test. 
    2. Use Postman to call `/api/subscribe` as before (with channel IDs).  
    3. Inspect logs to confirm the server is making a subscription request to YouTube's hub.  
    4. You can temporarily verify the GET handshake by manually calling `[your-vercel-url]/api/websub?hub.mode=subscribe&hub.challenge=12345` to confirm it echoes back as YouTube expects.  

## Pending Tests for Implemented Functionality

- [x] **Test 1: Basic Subscription Flow**
  - Make a POST request to `/api/subscribe` with channel IDs and webhook URL
  - Verify the subscription is stored in Redis
  - Check logs to confirm subscription requests are sent to YouTube

- [x] **Test 2: Verification Endpoint**
  - Make a GET request to `/api/websub` with `hub.challenge` parameter
  - Verify the endpoint responds with the challenge value

- [x] **Test 3: Subscription Updates**
  - Make a POST request to `/api/subscribe` with an existing webhook URL but new channel IDs
  - Verify that only the new channels are added to the existing subscription
  - Check logs to confirm only new channels are subscribed with YouTube

- [x] **Test 4: Full YouTube Integration**
  - Deploy the app to a public URL (Vercel or using ngrok)
  - Make a subscription request with real channel IDs
  - Verify that YouTube sends a verification request to your `/api/websub` endpoint
  - Verify that the subscription is confirmed with YouTube

- [x] **Test 5: Unique Callback URLs**
  - Verify that each webhook URL gets a unique callback URL for YouTube subscriptions
  - Confirm that subscriptions for one webhook don't affect subscriptions for other webhooks
  - Test that the dynamic route handler `/api/websub/[userKey].js` correctly processes YouTube's verification requests

- [x] **Test 6: N8N Dual Webhook Support**
  - Verify that when querying with either webhook URL, the API returns status for both primary and related webhooks
  - Confirm the response structure includes both primary and related webhook information

- [x] **Test 7: YouTube Notification Forwarding**
  - Verify that YouTube notifications are correctly parsed and forwarded to N8N webhooks
  - Confirm that both test and production N8N webhooks receive identical JSON payloads
  - Test the bidirectional forwarding for N8N webhooks (notifications sent to both test and production URLs)

**Note**: For Test 4, your app needs to be publicly accessible for YouTube to reach your `/api/websub` endpoint. Options include:
1. Deploying to Vercel
2. Using ngrok to expose your local server
3. Using a similar tunneling service like Cloudflare Tunnel

---

## Enhanced Subscription Management System

- [x] **Implementation of Unique Callback URLs**
  - **Task**:
    1. ✅ Create a dynamic route handler at `/api/websub/[userKey].js` to process YouTube's verification requests and notifications
    2. ✅ Modify the PubSubHubbub library to generate unique callback URLs for each webhook URL
    3. ✅ Update the subscription process to use these unique callback URLs
    4. ✅ Ensure each webhook's subscriptions are isolated from other webhooks
  - **Files**:
    - ✅ `pages/api/websub/[userKey].js`: Dynamic route handler for YouTube callbacks
    - ✅ `lib/pubsubhubbub.js`: Updated to generate unique callback URLs
    - ✅ `pages/api/subscribe.js`: Modified to use the new callback URL generation
  - **Benefits**:
    1. ✅ Improved isolation between different webhook subscriptions
    2. ✅ Better subscription management and tracking
    3. ✅ Enhanced security through unique user keys

- [x] **N8N Dual Webhook Support**
  - **Task**:
    1. ✅ Enhance the subscription status API to detect N8N webhook URLs
    2. ✅ When an N8N webhook URL is provided, return status for both test and production webhooks
    3. ✅ Structure the response to clearly distinguish between primary and related webhooks
  - **Files**:
    - ✅ `pages/api/subscription-status.js`: Enhanced to support N8N dual webhooks
  - **Benefits**:
    1. ✅ Improved user experience for N8N users
    2. ✅ Reduced API calls needed to check both webhook statuses
    3. ✅ Better visibility of subscription status across related webhooks

---

## N8N Setup & Workflow 1 (Webhook Listener)

- [ ] **Step 6: Create N8N Workflow 1 (Webhook Listener)**
  - **Task**:
    1. In N8N, create a new workflow that has a Webhook node set to `POST /webhook/youtube-updates` (for example).  
    2. Keep it in "Test" mode so you get the unique test URL.  
    3. We won't yet connect the Next.js endpoint – the next step will be to forward from `/api/websub` to the N8N webhook.  
    4. No code changes in Next.js here; this is purely an N8N configuration step.
  - **Files**: *No Next.js file changes, only an N8N workflow*
  - **Step Dependencies**: None (technically you can do this any time)
  - **User Instructions**: 
    1. Copy the unique N8N test webhook URL – we'll use it in an upcoming step.  
    2. Keep the workflow "listening" so you can see test data come in.

---

## Forwarding YouTube Webhooks to N8N

- [x] **Step 7: Update `/api/websub/[userKey].js` to Forward Notifications to N8N**
  - **Task**:
    1. ✅ In the dynamic route handler, after verifying the request is indeed a real YouTube webhook, filter which user subscription it relates to (based on channel ID in the XML feed).  
    2. ✅ Forward the notification data (new video info) to the correct user's `webhookUrl` found in Redis (which is the N8N URL from Step 6).  
    3. ✅ Make sure to handle errors if multiple users or channels are found.  
    4. ✅ Return a success response or an error response as needed.
    5. ✅ Ensure consistent JSON formatting between test and production webhooks for N8N.
  - **Files**:
    - ✅ `pages/api/websub/[userKey].js`: Added logic to parse YouTube's XML and forward to the appropriate webhook URL.
  - **Step Dependencies**: Steps 1, 2, 4, 5, 6
  - **Benefits**:
    1. ✅ Automatic forwarding of YouTube notifications to N8N webhooks
    2. ✅ Consistent JSON format for both test and production webhooks
    3. ✅ Bidirectional forwarding for N8N webhooks (test → prod and prod → test)
  - **User Instructions**: 
    1. ✅ Test by simulating a POST to `/api/websub/[userKey]` with example XML from YouTube (the actual structure is an Atom feed).  
    2. ✅ Ensure N8N is publicly reachable to receive the forwarded notifications.  
    3. ✅ In N8N, watch for incoming data to confirm the consistent JSON format.

---

## N8N Workflow 2 (Subscription Request) – Optional

- [ ] **Step 8: Create N8N "Subscription Request" Workflow**
  - **Task**:
    1. Add a "Manual Trigger" node in N8N.  
    2. Add an "HTTP Request" node pointing to `[your-vercel-url]/api/subscribe` with a body containing `"channelIds"` and `"webhookUrl"`.  
    3. (This replicates a typical user subscription but now triggered from N8N.)
  - **Files**: *No Next.js changes, purely an N8N workflow*
  - **Step Dependencies**: Step 2
  - **User Instructions**: 
    1. Run it manually to test subscription.  
    2. Confirm data in Redis.

---

## Subscription Renewal Implementation

- [x] **Step 9: Enhanced `/api/subscribe` for Subscription Renewal**
  - **Task**:
    1. ✅ Instead of creating a separate `/api/resubscribe` endpoint, we enhanced the existing `/api/subscribe` endpoint to handle both new subscriptions and resubscriptions.
    2. ✅ Modified the endpoint to detect existing subscriptions and renew them with YouTube's PubSubHubbub hub.
    3. ✅ Updated the response format to include information about renewed subscriptions.
  - **Files**:
    - ✅ `pages/api/subscribe.js`: Enhanced to handle both new subscriptions and resubscriptions.
  - **Benefits**:
    1. ✅ Simplified API structure with a single endpoint for all subscription operations
    2. ✅ Improved user experience with consistent response format
    3. ✅ Reduced code duplication and maintenance overhead
  - **User Instructions**:
    1. ✅ Use the same `/api/subscribe` endpoint for both new subscriptions and renewals
    2. ✅ The endpoint automatically detects if a channel is already subscribed and renews it if needed

---

## N8N Workflow 3 (Auto-Resubscribe)

- [ ] **Step 10: Create N8N Workflow to Call `/api/subscribe` Every 9 Days**
  - **Task**:
    1. In N8N, create a new workflow with a Cron node set to run every 9 days.  
    2. Add an HTTP Request node calling `[your-vercel-url]/api/subscribe` with `POST` and the appropriate body containing channel IDs and webhook URL.  
    3. Save and activate the workflow.
  - **Files**: *No Next.js changes, only an N8N workflow*
  - **Step Dependencies**: Step 9
  - **User Instructions**: 
    1. Optionally test by making the Cron node run immediately.  
    2. Verify the response is successful, ensuring subscriptions are renewed.

---

## Final Testing, Validation & Deployment

- [x] **Step 11: Comprehensive Testing of the Entire Flow**
  - **Task**:
    1. ✅ **Local Tests**: Use Postman to test `/api/subscribe`, `/api/websub/[userKey]`, and subscription status endpoints.  
    2. **N8N**:
       - ✅ Workflow 1 is listening and receiving notifications.  
       - Workflow 2 (optional usage).  
       - Workflow 3 automatically calls subscribe every 9 days.  
    3. **YouTube**:
       - ✅ Finalize the actual YouTube PubSubHubbub subscription steps and check if YouTube acknowledges successful subscription.  
       - ✅ Test with a real or mock YouTube channel to see if notifications come in.
  - **Files**: None (just testing)
  - **Step Dependencies**: All previous steps
  - **User Instructions**:
    1. ✅ Deploy to Vercel.  
    2. ✅ Use real channel IDs if you want genuine notifications.  
    3. ✅ Monitor logs on Vercel to confirm all calls are happening as expected.  
    4. ✅ In N8N, watch if the Workflow 1 receives the new video notification when an upload event occurs.

---

- [x] **Step 12: Final Deployment & Maintenance**
  - **Task**:
    1. ~~Ensure `.env` variables (if used) are set in Vercel environment.~~  
    2. Implement Upstash Redis storage for production:
       - ✅ Install Upstash Redis: `npm install @upstash/redis`
       - ✅ Update `lib/storage.js` to use Upstash Redis instead of local file storage
       - ✅ Configure Upstash Redis in your Vercel project settings
    3. ✅ Confirm subscription data is properly stored and accessible in the Vercel environment.
    4. ✅ Provide instructions for maintaining the system (e.g., clearing subscriptions with `/api/clear-subscriptions`).
    5. ✅ Thoroughly comment the code in each file so it's easy for new developers to understand.
  - **Files**: 
    - ✅ `lib/storage.js`: Updated to use Upstash Redis for production
    - ✅ `pages/api/clear-subscriptions.js`: Added endpoint to clear all subscriptions
    - ✅ `pages/api/subscription-status.js`: Added endpoint to check subscription status with YouTube
    - ✅ `pages/api/list-subscriptions.js`: Added endpoint to list all subscriptions
    - No other new files, but ensure code is thoroughly documented.
  - **Step Dependencies**: All previous steps
  - **User Instructions**:
    1. ✅ After final deployment, re-check with Postman or cURL.  
    2. Double-check that the auto-resubscribe Cron job in N8N is active.
    3. ✅ Monitor Upstash Redis usage and storage limits.

---

## Documentation

- [x] **Step 13: Create API Documentation**
  - **Task**:
    1. ✅ Create comprehensive documentation for all API endpoints
    2. ✅ Document the subscription process and webhook verification
    3. ✅ Provide examples for all API requests and responses
    4. ✅ Document the N8N integration features
    5. ✅ Create a troubleshooting guide
  - **Files**:
    - ✅ `mintlify-docs/api-reference/endpoint/subscribe.mdx`: Documentation for the subscribe endpoint
    - ✅ `mintlify-docs/api-reference/endpoint/subscription-status.mdx`: Documentation for the subscription status endpoint
    - ✅ `mintlify-docs/api-reference/endpoint/unsubscribe.mdx`: Documentation for the unsubscribe endpoint
    - ✅ `mintlify-docs/api-reference/endpoint/notification-format.mdx`: Documentation for the notification format
    - ✅ `mintlify-docs/api-reference/endpoint/webhook-verification.mdx`: Documentation for webhook verification
    - ✅ `mintlify-docs/n8n-integration/getting-started.mdx`: Documentation for N8N integration
    - ✅ `mintlify-docs/troubleshooting.mdx`: Troubleshooting guide
    - ✅ `mintlify-docs/introduction.mdx`: Introduction to the YouTube Notification System
    - ✅ `mintlify-docs/quickstart.mdx`: Quickstart guide
  - **Benefits**:
    1. ✅ Clear and accurate documentation for users
    2. ✅ Reduced support requests through comprehensive guides
    3. ✅ Improved user experience with detailed examples
  - **User Instructions**:
    1. ✅ Review the documentation for accuracy and completeness
    2. ✅ Test the examples to ensure they work as expected
    3. ✅ Deploy the documentation to Mintlify

---

### Summary of Overall Approach

1. **Incrementally build the Next.js serverless routes** needed for subscribing (`/api/subscribe`), receiving YouTube notifications (`/api/websub`), and renewing subscriptions (`/api/resubscribe`).
2. **Use Upstash Redis** for storage in the serverless functions.
3. **Integrate with N8N** by setting up three workflows:
   - Workflow 1: Webhook listener for new YouTube videos.  
   - Workflow 2: Optional subscription request from N8N.  
   - Workflow 3: Cron-based auto-resubscribe every 9 days.
4. **Test at each step** by deploying partial changes to Vercel, making sure each endpoint responds as expected (with Postman or cURL).
5. **Finalize** with real YouTube channel IDs, verifying that notifications arrive in N8N.
6. **Document** all API endpoints and features with comprehensive guides and examples.

This plan ensures we gradually build the system while verifying each piece works before adding the next. It also follows the final high-level system design you requested.

