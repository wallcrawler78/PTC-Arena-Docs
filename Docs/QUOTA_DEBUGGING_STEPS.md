# Gemini API Quota Debugging Steps

## Issue
Getting "Rate limit exceeded" errors even though:
- Local tracking shows "0/15 requests in window" ✓
- Should be well under the 15/minute limit ✓
- New API key generated ✓
- Double API call bug fixed ✓

## Most Likely Cause
Daily quota (1,500 requests/day) is exhausted. But we need to verify this in Google Cloud Console.

---

## Step 1: Check Quota Usage in Google Cloud Console

### Go to API Dashboard:

1. **Visit Google Cloud Console**:
   - Go to: https://console.cloud.google.com
   - Or click your project name in Google AI Studio (if you generated the API key there)

2. **Navigate to APIs & Services**:
   - In the left sidebar, click **"APIs & Services"** > **"Enabled APIs & services"**
   - Or direct link: https://console.cloud.google.com/apis/dashboard

3. **Find Generative Language API**:
   - Search for "Generative Language API" in the list
   - Click on it

4. **View Quotas**:
   - Click the **"Quotas"** tab
   - Look for these metrics:
     - **Requests per minute (RPM)**: Should show current usage out of 15
     - **Requests per day (RPD)**: Should show current usage out of 1,500
     - **Tokens per month**: Should show current usage out of 1,000,000

5. **Check Metrics**:
   - Click the **"Metrics"** tab
   - View the graph showing API requests over time
   - Set time range to "Last 24 hours" or "Last 7 days"
   - This will show you EXACTLY how many requests were made and when

---

## Step 2: What to Look For

### Scenario A: Daily Quota Exhausted (Most Likely)
**You'll see**:
- RPD quota: ~1,500 / 1,500 (or close to it)
- Graph shows a spike of ~1,500 requests in the past 24 hours
- Quota resets at midnight UTC

**What This Means**:
- The double API call bug caused you to exhaust daily quota during testing
- You need to wait until midnight UTC for reset (7pm EST / 4pm PST)

**Solution**:
- Wait for midnight UTC quota reset
- After reset, you'll have 1,500 requests available again
- With the bug fixed, you'll get twice as many generations per day

---

### Scenario B: API Key Project Mismatch
**You'll see**:
- Very low usage (< 100 requests) in the quota dashboard
- But still getting 429 errors

**What This Means**:
- Your API key might be from a different Google Cloud Project
- Or the quota is enforced at a different level (organization, billing account)

**Solution**:
- Verify the API key matches the project you're viewing
- Check if you have multiple Google Cloud Projects
- Look for quota limits at the organization level

---

### Scenario C: Different Quota Limit Applied
**You'll see**:
- Quota limit is LOWER than expected (not 1,500/day)
- Might show custom quota limits

**What This Means**:
- Free tier limits might be different for your account
- Might have trial limitations
- Geographic restrictions

**Solution**:
- Check if you're on a free trial with different limits
- Consider upgrading to paid tier for higher limits
- Contact Google Cloud Support for quota increase

---

## Step 3: Verify API Key Configuration

### Check Which Project Your API Key Belongs To:

1. **Go to Google AI Studio**:
   - Visit: https://aistudio.google.com/app/apikey

2. **View Your API Keys**:
   - You should see your API key(s) listed
   - Note which **Google Cloud Project** each key is associated with

3. **Match Project**:
   - Make sure the project shown matches the project you're checking quotas for
   - If they don't match, you're checking the wrong project

---

## Step 4: Alternative API Key Sources

If you created your API key in **Google AI Studio** (https://aistudio.google.com):
- Quotas are managed there, not in Cloud Console
- Free tier: 15 RPM, 1,500 RPD
- Check usage in AI Studio's settings

If you created it in **Google Cloud Console**:
- Quotas are in Cloud Console APIs & Services
- Limits depend on your project's billing/tier

---

## Step 5: Immediate Workaround (If You Can't Wait)

### Option A: Create New Google Cloud Project
1. Go to Cloud Console
2. Create a brand new project
3. Enable Generative Language API
4. Generate a new API key from that project
5. Use that key in the add-on
6. You'll get a fresh 1,500/day quota

**Note**: This is a workaround. The proper solution is waiting for quota reset.

### Option B: Use a Different Google Account
1. Create/use a different Google account
2. Generate API key from that account
3. Configure in the add-on
4. Fresh quotas

**Note**: Only if you have another Google account available.

---

## Step 6: Report Back

After checking the Cloud Console, report:

1. **Current Quota Usage**:
   - RPM: X / 15
   - RPD: X / 1,500
   - Tokens: X / 1,000,000

2. **API Key Project**:
   - Project name shown in AI Studio
   - Does it match the project you checked?

3. **Request Timeline**:
   - Graph showing when requests were made
   - Did they all happen in one burst?

This will tell us definitively what's going on and the best path forward.

---

## Expected Outcome

**Most Likely**: You'll see ~1,500 requests in the past 24 hours due to the double API call bug during testing. Solution: Wait for midnight UTC reset.

**Less Likely**: Different issue with project/quota configuration. We'll debug based on what you find.

---

## Reference: UTC Midnight Conversion

Quota resets at **00:00 UTC** (midnight UTC).

**For January 16, 2026**:
- Midnight UTC tonight = 7:00 PM EST (Jan 16)
- Midnight UTC tonight = 4:00 PM PST (Jan 16)

If it's currently 12:08 PM your local time:
- EST: Wait ~7 hours
- PST: Wait ~4 hours

**BUT**: If midnight UTC already passed last night (which it should have), your quota should have reset already. If you're still getting 429, we need to investigate further via Cloud Console.
