# Resend Newsletter Integration Setup

This guide walks you through integrating Resend with your blog's subscribe form to manage newsletter subscriptions.

## Overview

Your subscribe form now uses Resend's Audiences API to manage subscribers. This integrates seamlessly with your existing RSS-to-email setup on Render.

## Prerequisites

- Resend account (you should already have one for your RSS-to-email setup)
- Netlify account (for deploying the serverless function)

## Setup Steps

### 1. Install Dependencies

Run the following command to install the Resend SDK:

```bash
npm install
```

### 2. Create an Audience in Resend

1. Go to [Resend Dashboard](https://resend.com/audiences)
2. Click "Create Audience"
3. Give it a name (e.g., "Blog Newsletter Subscribers")
4. Copy the **Audience ID** (you'll need this for the next step)

### 3. Get Your Resend API Key

1. Go to [Resend API Keys](https://resend.com/api-keys)
2. Either use an existing API key or create a new one
3. Make sure it has permissions for "Audiences" (to add/manage contacts)
4. Copy the API key

### 4. Configure Netlify Environment Variables

Add the following environment variables to your Netlify site:

1. Go to your Netlify dashboard
2. Navigate to: **Site Settings → Environment Variables**
3. Add the following variables:

   - **Variable Name:** `RESEND_API_KEY`
     - **Value:** Your Resend API key (starts with `re_`)
   
   - **Variable Name:** `RESEND_AUDIENCE_ID`
     - **Value:** Your Audience ID from step 2
   
   - **Variable Name:** `RESEND_FROM_EMAIL`
     - **Value:** Your verified sender email (e.g., `newsletter@yourdomain.com`)
     - **Note:** This email must be verified in Resend
   
   - **Variable Name:** `CONFIRMATION_SECRET`
     - **Value:** A random secret string (e.g., generate with `openssl rand -hex 32`)
     - **Purpose:** Used to sign confirmation tokens securely

4. Click "Save"

### 5. Deploy Your Changes

Deploy your changes to Netlify:

```bash
# Commit your changes
git add .
git commit -m "Integrate Resend for newsletter subscriptions"
git push origin main
```

Netlify will automatically build and deploy your changes.

### 6. Test the Integration

1. Visit your blog
2. Enter an email address in the subscribe form (top of the page)
3. Click "Subscribe"
4. **Check your email inbox** for the confirmation email
5. Click the "Confirm Subscription" button in the email
6. You should see a success page
7. Check your Resend dashboard to verify the contact was added to your audience

## How It Works (Double Opt-In)

1. **User subscribes**: When a user enters their email and clicks "Subscribe", the form sends a POST request to your Netlify function
2. **Confirmation email sent**: The function sends a beautiful HTML confirmation email with a secure token
3. **User clicks confirmation link**: The link takes them to the confirmation endpoint
4. **Token validated**: The system verifies the token is valid and not expired (24-hour expiration)
5. **Added to audience**: The email is added to your Resend audience
6. **Success page displayed**: User sees a confirmation page and is redirected back to your blog

### Why Double Opt-In?

- **Better deliverability**: Email providers trust lists built with confirmed subscribers
- **Higher engagement**: Subscribers are genuinely interested
- **Reduces spam complaints**: Only people who want emails are subscribed
- **Compliant**: Meets best practices for email marketing

## Sending Newsletters

You have two options for sending newsletters:

### Option 1: Use Your Existing RSS-to-Email Setup (Recommended)
Since you already have a cron job on Render that sends RSS updates via Resend, your subscribers will automatically receive emails when you publish new posts.

**To include subscribers from this form:**
- Make sure your Render cron job uses the same **Audience ID**
- The cron job should send emails to all contacts in that audience

### Option 2: Manual Email Campaigns
You can also send one-off campaigns using Resend:
1. Go to [Resend Broadcasts](https://resend.com/broadcasts)
2. Create a new broadcast
3. Select your audience
4. Compose and send your email

## Troubleshooting

### "Server configuration error"
- Make sure you've added all required environment variables to Netlify:
  - `RESEND_API_KEY`
  - `RESEND_AUDIENCE_ID`
  - `RESEND_FROM_EMAIL`
  - `CONFIRMATION_SECRET`
- Verify the environment variables are spelled correctly
- Redeploy your site after adding environment variables

### Confirmation email not received
- Check spam/junk folder
- Verify `RESEND_FROM_EMAIL` is a verified sender in Resend
- Check Netlify function logs for email sending errors
- Make sure you haven't exceeded Resend's rate limits

### "Invalid confirmation link"
- Link may have expired (24-hour expiration)
- Token may be corrupted (copy full URL)
- Ask user to subscribe again

### Subscriptions not appearing in Resend
1. Check the Netlify function logs:
   - Go to **Netlify Dashboard → Functions → subscribe**
   - Look for error messages
2. Verify your API key has "Audiences" permissions
3. Confirm the Audience ID is correct

## Additional Features

### Customizing the Confirmation Email

The confirmation email is defined in `netlify/functions/subscribe.js`. You can customize:
- Email subject
- HTML template design
- Button text and styling
- Email copy

### Customizing Confirmation Pages

The success and error pages are in `netlify/functions/confirm-subscription.js`. You can customize:
- Page design and styling
- Success/error messages
- Redirect behavior

### Unsubscribe Management
Resend automatically handles unsubscribes:
- Each email sent via Resend includes an unsubscribe link
- When users unsubscribe, they're marked as unsubscribed in your audience
- You don't need to implement this manually

## Resources

- [Resend Audiences Documentation](https://resend.com/docs/api-reference/audiences)
- [Resend Contacts API](https://resend.com/docs/api-reference/contacts)
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)

## Notes

- The frontend code remains unchanged - all changes are backend only
- **Double opt-in is now enabled** - users must confirm their email before being added to the audience
- Confirmation tokens expire after 24 hours for security
- The old EmailOctopus configuration has been removed
- Make sure to verify your sender email in Resend before testing

## Security Features

- Tokens are cryptographically signed using HMAC-SHA256
- Tokens expire after 24 hours
- Email validation on both client and server side
- Duplicate subscription prevention
- CORS protection enabled