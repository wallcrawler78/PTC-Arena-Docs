# Gemini API Setup Guide

## Quick Start

To use the AI Document Generation features, you need to configure a free Google Gemini API key.

### Step 1: Get Your API Key

1. Visit **[Google AI Studio](https://aistudio.google.com/app/apikey)**
2. Sign in with your Google account
3. Click **"Create API Key"** (or "Get API Key")
4. Select an existing Google Cloud project or click **"Create API key in new project"**
5. Copy the generated API key (starts with `AIza...`)

### Step 2: Configure in Add-On

1. Open your Google Doc
2. Go to **Arena PLM > Settings > Configure Gemini API Key**
3. Paste your API key in the text field
4. Click **"Save API Key"**

That's it! You can now use AI Document Generation features.

## Using AI Features

### Generate Documents with AI

1. **Arena PLM > Document Generation > Generate with AI...**
2. Follow the 5-step wizard
3. Gemini will create a complete document with Arena tokens

### Autodetect Field Tokens

1. **Arena PLM > Document Generation > Autodetect Field Tokens...**
2. Select a category
3. Gemini will scan your document and suggest where to place tokens

## API Key Security

- Your API key is stored **securely** in your Google account
- It's **never shared** with anyone
- Only you can access it
- Stored in Google Apps Script UserProperties (encrypted)

## Gemini API Free Tier

Google provides a **generous free tier** for the Gemini API:

- **15 requests per minute**
- **1,500 requests per day**
- **1 million tokens per month**

This is typically more than enough for personal document generation use.

## Troubleshooting

### "Gemini API key not configured"

**Solution**: Configure your API key via **Arena PLM > Settings > Configure Gemini API Key**

### "Invalid Gemini API key"

**Possible causes**:
- API key was entered incorrectly
- API key was revoked or deleted in Google AI Studio

**Solution**:
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Verify your API key is still active
3. Generate a new one if needed
4. Update it in **Arena PLM > Settings > Configure Gemini API Key**

### "Rate limit exceeded"

**Cause**: You've hit the free tier limits (15 requests/min or 1,500/day)

**Solution**: Wait a few minutes and try again

### API Key Best Practices

1. **Keep it private**: Never share your API key with others
2. **Regenerate if exposed**: If you accidentally share it, generate a new one
3. **One key per user**: Each person should use their own API key
4. **Monitor usage**: Check your usage at [Google AI Studio](https://aistudio.google.com)

## Managing Your API Key

### View Current Status

**Arena PLM > Settings > Configure Gemini API Key** shows:
- ✓ API key is configured (green)
- ✗ No API key configured (red)

### Clear API Key

1. **Arena PLM > Settings > Configure Gemini API Key**
2. Click **"Clear Key"**
3. Confirm

This removes your API key from the add-on. You'll need to re-enter it to use AI features.

## Why API Key Instead of OAuth?

The Gemini API doesn't support OAuth authentication in Google Apps Script. API key authentication is:

- **Simpler**: No complex OAuth flows
- **Free**: No Google Cloud project billing required for basic usage
- **Secure**: Stored encrypted in your Google account
- **Standard**: This is Google's recommended approach for Gemini in Apps Script

## Links

- **Get API Key**: https://aistudio.google.com/app/apikey
- **Gemini API Docs**: https://ai.google.dev/docs
- **Pricing**: https://ai.google.dev/pricing
- **Free Tier Limits**: https://ai.google.dev/pricing#1_5flash

## Support

If you have issues:

1. Verify API key is valid at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Check Apps Script logs (in the add-on editor)
3. Try generating a new API key
4. Report issues on [GitHub](https://github.com/wallcrawler78/PTC-Arena-Docs/issues)
