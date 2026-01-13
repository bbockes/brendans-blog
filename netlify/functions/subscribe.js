import 'dotenv/config';
import { Resend } from 'resend';
import crypto from 'crypto';

export const handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({})
    };
  }

  try {
    // Parse the request body
    const { email } = JSON.parse(event.body || '{}');

    // Validate email
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Please enter a valid email address' })
      };
    }

    // Get Resend credentials from environment variables
    const apiKey = process.env.RESEND_API_KEY;
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const siteUrl = process.env.URL || 'http://localhost:8888';
    
    console.log('Environment Variables:', {
      RESEND_API_KEY: apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 3)}` : 'NOT FOUND',
      RESEND_AUDIENCE_ID: audienceId || 'NOT FOUND',
      RESEND_FROM_EMAIL: fromEmail,
      SITE_URL: siteUrl
    });

    if (!apiKey || !audienceId) {
      console.error('Missing Resend configuration');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Initialize Resend client
    const resend = new Resend(apiKey);

    // Note: We allow re-subscription to update the subscription date
    // The confirmation handler will remove and re-add the contact if they already exist

    // Generate confirmation token (email + timestamp + secret)
    const secret = process.env.CONFIRMATION_SECRET || 'your-secret-key-change-this';
    const timestamp = Date.now();
    const tokenData = `${trimmedEmail}:${timestamp}`;
    const token = crypto
      .createHmac('sha256', secret)
      .update(tokenData)
      .digest('hex');
    
    // Encode email and token for URL
    const confirmToken = Buffer.from(JSON.stringify({
      email: trimmedEmail,
      timestamp,
      token
    })).toString('base64url');

    // Create confirmation URL
    const confirmUrl = `${siteUrl}/.netlify/functions/confirm-subscription?token=${confirmToken}`;

    console.log('Sending confirmation email to:', trimmedEmail);

    // Send confirmation email
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: trimmedEmail,
      subject: 'Confirm your newsletter subscription',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirm Your Subscription</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px; font-weight: 600;">
                          Confirm Your Subscription
                        </h1>
                        <p style="margin: 0 0 30px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          Thanks for subscribing to Brendan's Blog! Click the button below to confirm your email address and start receiving updates.
                        </p>
                        <table role="presentation" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background-color: #3b82f6;">
                              <a href="${confirmUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                                Confirm Subscription
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin: 30px 0 0 0; color: #718096; font-size: 14px; line-height: 1.5;">
                          If you didn't request this subscription, you can safely ignore this email.
                        </p>
                        <p style="margin: 10px 0 0 0; color: #a0aec0; font-size: 12px;">
                          This link will expire in 24 hours.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px 30px; background-color: #f7fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; color: #718096; font-size: 12px; text-align: center;">
                          Or copy and paste this link into your browser:<br>
                          <a href="${confirmUrl}" style="color: #3b82f6; word-break: break-all;">${confirmUrl}</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `
    });

    // Check for errors in the email response
    if (emailResponse.error) {
      console.error('Resend email error:', emailResponse.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to send confirmation email. Please try again.' 
        })
      };
    }

    console.log('✅ Confirmation email sent:', trimmedEmail);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Please check your email to confirm your subscription!' 
      })
    };

  } catch (err) {
    console.error('Newsletter subscription error:', err);
    
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    
    if (err.message) {
      errorMessage = err.message;
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage })
    };
  }
};
