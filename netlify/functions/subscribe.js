import 'dotenv/config';
import { Resend } from 'resend';

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
    
    console.log('Environment Variables:', {
      RESEND_API_KEY: apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 3)}` : 'NOT FOUND',
      RESEND_AUDIENCE_ID: audienceId || 'NOT FOUND'
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

    console.log('Adding contact to Resend audience:', {
      audienceId,
      email: `${trimmedEmail.substring(0, 2)}...@...${trimmedEmail.split('@')[1]}`
    });

    // Add contact to Resend audience
    const response = await resend.contacts.create({
      email: trimmedEmail,
      audienceId: audienceId,
      unsubscribed: false
    });

    // Check for errors in the response
    if (response.error) {
      console.error('Resend API error:', response.error);
      
      let errorMessage = 'Failed to subscribe to newsletter';
      
      // Handle specific Resend error codes
      if (response.error.message) {
        errorMessage = response.error.message;
        
        // Make error messages more user-friendly
        if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
          errorMessage = 'This email is already subscribed to the newsletter!';
        }
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    console.log('✅ Successfully subscribed:', trimmedEmail);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Successfully subscribed to the newsletter!' 
      })
    };

  } catch (err) {
    console.error('Newsletter subscription error:', err);
    
    // Handle specific error cases
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    
    if (err.message) {
      errorMessage = err.message;
      
      // Make error messages more user-friendly
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        errorMessage = 'This email is already subscribed to the newsletter!';
      } else if (errorMessage.includes('Invalid email')) {
        errorMessage = 'Please enter a valid email address';
      }
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage })
    };
  }
};
