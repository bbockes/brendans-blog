import 'dotenv/config';
import { Resend } from 'resend';
import crypto from 'crypto';

export const handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/html'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: 'Method not allowed'
    };
  }

  try {
    // Get token from query string
    const token = event.queryStringParameters?.token;

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: renderErrorPage('Invalid confirmation link')
      };
    }

    // Decode token
    let tokenData;
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      tokenData = JSON.parse(decoded);
    } catch (decodeError) {
      console.error('Token decode error:', decodeError);
      return {
        statusCode: 400,
        headers,
        body: renderErrorPage('Invalid confirmation link')
      };
    }

    const { email, timestamp, token: providedToken } = tokenData;

    // Validate token hasn't expired (24 hours)
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (now - timestamp > twentyFourHours) {
      return {
        statusCode: 400,
        headers,
        body: renderErrorPage('This confirmation link has expired. Please subscribe again.')
      };
    }

    // Verify token signature
    const secret = process.env.CONFIRMATION_SECRET || 'your-secret-key-change-this';
    const expectedToken = crypto
      .createHmac('sha256', secret)
      .update(`${email}:${timestamp}`)
      .digest('hex');

    if (providedToken !== expectedToken) {
      console.error('Token verification failed');
      return {
        statusCode: 400,
        headers,
        body: renderErrorPage('Invalid confirmation link')
      };
    }

    // Get Resend credentials
    const apiKey = process.env.RESEND_API_KEY;
    const audienceId = process.env.RESEND_AUDIENCE_ID;

    if (!apiKey || !audienceId) {
      console.error('Missing Resend configuration');
      return {
        statusCode: 500,
        headers,
        body: renderErrorPage('Server configuration error')
      };
    }

    // Initialize Resend client
    const resend = new Resend(apiKey);

    console.log('Adding confirmed contact to Resend audience:', email);

    // Add contact to Resend audience
    const response = await resend.contacts.create({
      email: email,
      audienceId: audienceId,
      unsubscribed: false
    });

    // Check for errors
    if (response.error) {
      console.error('Resend API error:', response.error);
      
      // Handle duplicate subscription gracefully
      if (response.error.message?.includes('already exists') || 
          response.error.message?.includes('duplicate')) {
        console.log('Email already subscribed:', email);
        return {
          statusCode: 200,
          headers,
          body: renderSuccessPage(email, true)
        };
      }

      return {
        statusCode: 500,
        headers,
        body: renderErrorPage('Failed to complete subscription. Please try again.')
      };
    }

    console.log('✅ Successfully confirmed subscription:', email);
    return {
      statusCode: 200,
      headers,
      body: renderSuccessPage(email, false)
    };

  } catch (err) {
    console.error('Subscription confirmation error:', err);
    return {
      statusCode: 500,
      headers,
      body: renderErrorPage('An unexpected error occurred. Please try again.')
    };
  }
};

function renderSuccessPage(email, alreadySubscribed) {
  const message = alreadySubscribed 
    ? "You're already subscribed! No need to confirm again."
    : "You've successfully subscribed to the newsletter!";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Confirmed</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 48px 32px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
          }
          .icon {
            width: 80px;
            height: 80px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          }
          .checkmark {
            width: 40px;
            height: 40px;
            border: 4px solid white;
            border-radius: 50%;
            position: relative;
          }
          .checkmark::after {
            content: '';
            position: absolute;
            width: 12px;
            height: 20px;
            border: solid white;
            border-width: 0 4px 4px 0;
            top: 6px;
            left: 10px;
            transform: rotate(45deg);
          }
          h1 {
            color: #1a1a1a;
            font-size: 28px;
            margin-bottom: 16px;
            font-weight: 600;
          }
          p {
            color: #4a5568;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          .email {
            background: #f7fafc;
            padding: 12px 16px;
            border-radius: 6px;
            color: #2d3748;
            font-family: 'Courier New', monospace;
            margin-bottom: 32px;
            word-break: break-all;
          }
          .button {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 14px 32px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.2s;
          }
          .button:hover {
            background: #2563eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            <div class="checkmark"></div>
          </div>
          <h1>Subscription Confirmed!</h1>
          <p>${message}</p>
          <div class="email">${email}</div>
          <a href="/" class="button">Return to Blog</a>
        </div>
      </body>
    </html>
  `;
}

function renderErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Error</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 48px 32px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
          }
          .icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          }
          .x-mark {
            width: 40px;
            height: 40px;
            position: relative;
          }
          .x-mark::before,
          .x-mark::after {
            content: '';
            position: absolute;
            width: 4px;
            height: 40px;
            background: white;
            left: 18px;
          }
          .x-mark::before {
            transform: rotate(45deg);
          }
          .x-mark::after {
            transform: rotate(-45deg);
          }
          h1 {
            color: #1a1a1a;
            font-size: 28px;
            margin-bottom: 16px;
            font-weight: 600;
          }
          p {
            color: #4a5568;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          .button {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 14px 32px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.2s;
            margin-right: 12px;
          }
          .button:hover {
            background: #2563eb;
          }
          .button-secondary {
            background: #6b7280;
          }
          .button-secondary:hover {
            background: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            <div class="x-mark"></div>
          </div>
          <h1>Oops!</h1>
          <p>${message}</p>
          <a href="/" class="button">Return to Blog</a>
          <a href="/#subscribe" class="button button-secondary">Try Again</a>
        </div>
      </body>
    </html>
  `;
}
