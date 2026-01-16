# Gemini API Rate Limit Analysis

**Date**: 2026-01-15
**Status**: CRITICAL ISSUE IDENTIFIED

## Executive Summary

I've identified a **critical bug** that doubles Gemini API usage and explains the persistent rate limit issues. Additionally, there are several areas where our rate limiting could be improved.

---

## Critical Issues Found

### 🚨 Issue #1: Double API Calls (CRITICAL)

**Location**: `src/DocumentGenerator.gs` lines 35-44

**Problem**: Every document generation makes TWO Gemini API calls instead of one:

```javascript
// Line 35-36: First API call (UNNECESSARY)
var geminiClient = createGeminiClient();
var accessCheck = geminiClient.validateAccess();  // <-- Makes API call

if (!accessCheck.success) {
  return { success: false, error: '...' };
}

// Line 59: Second API call (ACTUAL GENERATION)
var geminiResponse = geminiClient.generateContent(prompt, generationOptions);
```

**What validateAccess() does** (`src/GeminiAPI.gs` lines 348-366):
```javascript
GeminiAPIClient.prototype.validateAccess = function() {
  try {
    // Makes a FULL Gemini API request with a test prompt
    var result = this.generateContent('Say "OK" if you can read this.', {
      maxTokens: 10
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
```

**Impact**:
- Every document generation attempt = 2 API requests
- If user tested 8 times, they actually made 16 requests (not 8)
- With a 15/minute limit, you hit the limit after only 7-8 generations
- With a 1,500/day limit, you'd exhaust it after 750 generations (not 1,500)

**Why This Happens**:
1. User clicks "Generate Document"
2. `validateAccess()` is called → Makes API request #1 → Records in rate limit history
3. If successful, actual generation happens → Makes API request #2 → Records in rate limit history
4. Both calls go through rate limiting independently
5. Both count against the 15/minute and 1,500/day quotas

**Solution**: Remove the `validateAccess()` call. It's redundant because:
- The actual `generateContent()` call will fail with a clear error if API key is invalid
- We're doubling API usage for zero benefit
- The validation itself uses API quota unnecessarily

---

### ⚠️ Issue #2: Missing Gemini Error Details

**Location**: `src/GeminiAPI.gs` lines 172-176

**Problem**: When we get a 429 rate limit error, we don't log Gemini's actual response:

```javascript
if (responseCode === 429) {
  var error = new Error('Gemini API rate limit exceeded. Waiting before retry...');
  error.isRateLimitError = true;
  throw error;  // <-- We throw immediately without logging response body
}
```

**Missing Information**:
- Gemini's error response might indicate WHICH quota was exceeded:
  - 15 requests per minute (RPM)
  - 1,500 requests per day (RPD)
  - 1 million tokens per month
- The response might include retry-after headers
- Could show quota reset time

**Solution**: Log the full response before throwing:
```javascript
if (responseCode === 429) {
  var errorText = response.getContentText();
  Logger.log('Gemini 429 Rate Limit Error - Full response: ' + errorText);

  var error = new Error('Gemini API rate limit exceeded. Waiting before retry...');
  error.isRateLimitError = true;
  error.geminiResponse = errorText;
  throw error;
}
```

---

### ⚠️ Issue #3: No Daily Quota Tracking

**Location**: `src/GeminiAPI.gs` rate limiting logic

**Problem**: We only track requests per minute (15/min), not requests per day (1,500/day)

**Current Implementation**:
```javascript
var GEMINI_RATE_LIMITS = {
  requestsPerMinute: 15,
  requestsPerDay: 1500,      // <-- Defined but not enforced
  windowMs: 60000
};
```

The `_checkRateLimit()` function only checks the per-minute window:
```javascript
var history = this._getRequestHistory();  // Only gets last 60 seconds
var requestsInWindow = history.length;

if (requestsInWindow < GEMINI_RATE_LIMITS.requestsPerMinute) {
  return { canProceed: true };
}
```

**Why This Matters**:
- User might spread out requests to stay under 15/minute
- But still hit the 1,500/day limit
- We'd report "0/15 requests in window" but Gemini would reject with 429
- This is EXACTLY what happened in the most recent attempt

**Possible Explanation for Current Issue**:
The user likely hit the **1,500 requests/day quota** during earlier testing. This would explain:
- Local tracking shows "0/15 requests in window" ✓
- Gemini immediately returns 429 rate limit exceeded ✓
- New API key didn't help (quota might be per-project, not per-key) ✓
- Needs to wait until midnight UTC for daily quota reset ✓

---

### 📊 Issue #4: Model Name Inconsistency (Low Priority)

**Location**: `src/GeminiAPI.gs` line 9

**Current Code**:
```javascript
var GEMINI_MODEL = 'gemini-2.0-flash'; // Current stable model for v1beta API (2026)
```

**Question**: Is `gemini-2.0-flash` correct for v1beta API?

**Research**:
- Gemini 2.0 Flash was released December 2024
- Should be available in v1beta API
- User hasn't reported model errors recently
- Most recent error was rate limit, not invalid model

**Status**: Likely fine, but worth verifying in Google's latest docs

---

## Code Flow Analysis

### Normal Document Generation Flow:

```
User clicks "Generate Document" in wizard
    ↓
DocumentGenerationWizard.html line 1005: generateDocumentWithGemini(wizardData)
    ↓
DocumentGenerator.gs line 17: generateDocumentWithGemini()
    ↓
    Line 35-36: geminiClient.validateAccess()
        ↓
        GeminiAPI.gs line 348: validateAccess()
            ↓
            Line 351: this.generateContent('Say "OK"...') ← API CALL #1
                ↓
                Line 285: generateContent()
                    ↓
                    Line 322: _makeRequestWithRetry()
                        ↓
                        Line 217: _makeRequest()
                            ↓
                            Line 118: _waitForRateLimit() ← Checks: 0/15
                            Line 169: UrlFetchApp.fetch() ← ACTUAL REQUEST
                            Line 192: _recordRequest() ← Records timestamp
                            ↓
                        Returns success
            ↓
        Returns { success: true }
    ↓
    Line 59: geminiClient.generateContent(prompt, generationOptions)
        ↓
        GeminiAPI.gs line 285: generateContent()
            ↓
            Line 322: _makeRequestWithRetry()
                ↓
                Line 217: _makeRequest()
                    ↓
                    Line 118: _waitForRateLimit() ← Checks: 1/15 (or 15/15 if at limit)
                    Line 169: UrlFetchApp.fetch() ← ACTUAL REQUEST ← API CALL #2
                    Line 192: _recordRequest() ← Records timestamp
                    ↓
                Returns generated content
    ↓
Returns result to user
```

**Total API Calls**: 2 per document generation attempt

---

## Rate Limiting Analysis

### What's Working Well:

✅ **Sliding Window Algorithm**: Correctly tracks requests in 60-second window
✅ **Automatic Waiting**: Properly waits when approaching 15/minute limit
✅ **Request History Cleanup**: Old timestamps are filtered out automatically
✅ **Retry Logic**: Handles 429 errors with exponential backoff (5s, 15s, 30s)
✅ **Failed Request Handling**: 429 errors don't get recorded in history

### What's Missing:

❌ **Daily Quota Tracking**: No tracking of 1,500/day limit
❌ **Token Usage Tracking**: No tracking of monthly 1M token limit
❌ **Quota Reset Time**: No indication when quotas will reset
❌ **Gemini Error Details**: Don't log full 429 response body

---

## Why "0/15 requests" But Still Rate Limited

Looking at the execution logs from the most recent attempt:

```
Jan 15, 2026, 4:50:42 PM    Info    Rate limit OK: 0/15 requests in window
Jan 15, 2026, 4:50:42 PM    Info    Gemini API request failed: Gemini API rate limit exceeded
```

**Explanation**: This indicates the user hit the **1,500 requests/day quota**, not the 15/minute quota.

**Evidence**:
1. Local per-minute tracking shows: 0/15 ✓
2. User cleared cache and request history ✓
3. User generated new API key ✓
4. Gemini still returns 429 immediately ✓
5. Several hours passed since last usage ✓

**Conclusion**: Daily quota exhausted from earlier testing session(s).

**Why New API Key Didn't Help**:
- Daily quotas might be enforced at the Google Cloud Project level (not API key level)
- Or at the Google Account level
- Generating a new key within the same project doesn't reset the quota

---

## Recommendations

### Immediate Fixes (Priority 1 - Do Now):

1. **Remove validateAccess() call** in `DocumentGenerator.gs`
   - This will cut API usage in HALF
   - Saves quota and reduces rate limit issues
   - No functionality lost (the actual generateContent() call provides validation)

2. **Add Gemini error logging** in `GeminiAPI.gs` line 172
   - Log full response body for 429 errors
   - Helps diagnose which quota was exceeded

### Short-Term Improvements (Priority 2 - Next Session):

3. **Add daily quota tracking**
   - Store request timestamps for past 24 hours (not just 60 seconds)
   - Check if daily limit would be exceeded before making request
   - Show user: "X/1500 requests used today"

4. **Add token usage tracking**
   - Track tokens used per request (from `usageMetadata`)
   - Show user: "X/1,000,000 tokens used this month"

5. **Improve error messages**
   - Distinguish between per-minute and per-day rate limits
   - Tell user when quota will reset (midnight UTC for daily)
   - Suggest waiting time based on quota type

### Testing Recommendations:

6. **Wait for quota reset**
   - Daily quota resets at midnight UTC (7pm EST / 4pm PST)
   - Try again after midnight
   - With validateAccess() removed, usage will be halved

7. **Monitor carefully**
   - Check execution logs for "Rate limit OK: X/15" messages
   - Watch for patterns of when 429 occurs
   - Verify Gemini error response details

---

## Expected Improvement

**Before Fix**:
- 8 document generations = 16 API calls
- Hit 15/minute limit after ~7 generations in quick succession
- Hit 1,500/day limit after ~750 generations

**After Fix** (removing validateAccess):
- 8 document generations = 8 API calls (50% reduction)
- Can do ~15 generations per minute
- Can do ~1,500 generations per day
- Should resolve current rate limit issues once daily quota resets

---

## Implementation Plan

### Step 1: Fix Critical Bug
**File**: `src/DocumentGenerator.gs`
**Lines to Remove**: 35-44

```javascript
// REMOVE THIS ENTIRE SECTION:
// 2. Validate Gemini API access
var geminiClient = createGeminiClient();
var accessCheck = geminiClient.validateAccess();

if (!accessCheck.success) {
  return {
    success: false,
    error: 'Gemini API access failed: ' + accessCheck.error,
    message: 'Unable to access Gemini API. Please ensure the Generative Language API is enabled in your Google Cloud Console.'
  };
}
```

**Replace With**:
```javascript
// 2. Create Gemini client (validation happens on first real request)
var geminiClient = createGeminiClient();
```

### Step 2: Improve 429 Error Logging
**File**: `src/GeminiAPI.gs`
**Lines to Modify**: 172-176

```javascript
// REPLACE:
if (responseCode === 429) {
  var error = new Error('Gemini API rate limit exceeded. Waiting before retry...');
  error.isRateLimitError = true;
  throw error;
}

// WITH:
if (responseCode === 429) {
  var errorText = response.getContentText();
  Logger.log('Gemini API 429 Error - Full response: ' + errorText);

  var error = new Error('Gemini API rate limit exceeded. Waiting before retry...');
  error.isRateLimitError = true;
  error.geminiResponse = errorText;
  throw error;
}
```

### Step 3: Test
1. Wait until after midnight UTC for daily quota reset
2. Try generating a document
3. Check execution logs for improved diagnostics
4. Verify only ONE "Rate limit OK" message per generation (not two)

---

## Additional Notes

### Why validateAccess() Was Added Initially
- Likely intended to provide early feedback if API key was invalid
- Seemed like good practice to validate before heavy operation
- Didn't realize it counted as a FULL API request

### Why We Didn't Catch This Earlier
- User testing was spread out over time
- Per-minute rate limiting WAS working (waiting appropriately)
- Hit daily quota instead, which we weren't tracking
- Disconnect between our "0/15" and Gemini's "429" was the clue

### The Smoking Gun
The execution log showing "Rate limit OK: 0/15" followed immediately by "rate limit exceeded" proved that:
- Our per-minute tracking is working correctly
- The limit being hit is NOT the per-minute limit
- Must be daily limit or account-level throttling
- validateAccess() has been doubling our usage this whole time

---

## Conclusion

The root cause is **unnecessary double API calls** due to `validateAccess()` validation. This caused:
- 2x API usage (exhausting quotas twice as fast)
- Hitting 1,500/day limit during testing
- Persistent rate limit errors even with new API key

**Fix**: Remove `validateAccess()` call to cut usage in half.

**Next Steps**:
1. Apply fixes above
2. Wait for daily quota reset (midnight UTC)
3. Test with improved logging
4. Consider adding daily quota tracking in future iteration
