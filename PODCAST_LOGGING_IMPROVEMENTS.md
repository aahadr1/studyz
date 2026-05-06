# Podcast Creation Logging Improvements

## Overview
Added comprehensive detailed logging throughout the podcast audio generation flow to diagnose Gemini TTS failures and identify the root cause when audio generation returns no URLs.

## Changes Made

### 1. **google-tts-client.ts** - Core TTS API Client

#### `getGeminiKey()`
- ✅ Logs API key configuration status
- ✅ Shows which environment variable is being used
- ✅ Displays key prefix for verification

#### `callGeminiTTS()`
- ✅ Logs API request initiation with model and key status
- ✅ Logs HTTP response status and headers
- ✅ Captures and logs fetch errors (network, timeout, abort)
- ✅ Logs detailed error response bodies (first 500 chars)
- ✅ Logs response structure analysis (candidates, parts, content)
- ✅ Logs when no audio data is found with full response preview
- ✅ Logs successful audio extraction with data size

#### `generateGeminiTTSAudio()` (Single-speaker)
- ✅ Logs input parameters (text length, preview, voice profile)
- ✅ Logs voice selection logic
- ✅ Logs successful generation with audio URL size
- ✅ Captures and logs generation failures with context

#### `generateGeminiMultiSpeakerChunk()` (Multi-speaker)
- ✅ Logs segment count, IDs, and roles
- ✅ Validates segment count requirements
- ✅ Logs generated script (length and preview)
- ✅ Logs splitting process and results
- ✅ Captures generation failures with full context

#### `splitPcmByWordCount()`
- ✅ Logs PCM buffer size and metadata
- ✅ Logs word count distribution across segments
- ✅ Logs byte-level slicing operations for each segment
- ✅ Logs audio URL generation for each split
- ✅ Validates all segments have audio URLs

### 2. **audio-generator.ts** - Audio Generation Orchestration

#### `generateMultiVoiceAudio()`
- ✅ Logs entry point with all parameters
- ✅ Logs text cleaning process (before/after lengths)
- ✅ Logs chunking strategy (chunk count and sizes)
- ✅ Logs processing mode per chunk (multi-speaker vs single-speaker)
- ✅ Logs API results count and mapping
- ✅ Logs segments with missing audio URLs
- ✅ Logs completion summary with success/failure counts
- ✅ Lists all failed segments for debugging

#### Multi-speaker chunk processing
- ✅ Logs valid input count vs total segments
- ✅ Logs each segment result (audio present or missing)
- ✅ Logs fallback triggers with detailed error context

#### Single-speaker processing
- ✅ Logs single-segment mode activation
- ✅ Logs result for single-speaker generation

#### Empty chunk handling
- ✅ Warns when all segments in a chunk are empty

#### `generateSingleSegment()`
- ✅ Logs input validation (text length, voice role)
- ✅ Logs successful generation details
- ✅ Captures and logs failures with full context

#### `fallbackSingleSpeaker()`
- ✅ Logs fallback mode entry
- ✅ Logs each segment in fallback individually
- ✅ Logs segment-level results (audio present/missing)
- ✅ Logs fallback completion summary

### 3. **process/route.ts** - Main Processing Endpoint

#### Audio generation block
- ✅ Logs generation start with environment check
- ✅ Displays GEMINI_API_KEY status and prefix
- ✅ Logs first 3 segments in detail (ID, speaker, text preview)
- ✅ Logs batch results summary (with/without audio counts)
- ✅ **CRITICAL**: Lists all segments WITHOUT audio URLs with details
- ✅ Logs critical failure when no audio URLs generated
- ✅ Displays complete error context on failures

## Diagnostic Capabilities

### The new logging will help identify:

1. **API Key Issues**
   - Missing GEMINI_API_KEY environment variable
   - Invalid or malformed API key
   - Wrong key being used

2. **API Failures**
   - HTTP error codes (401, 429, 500, etc.)
   - Rate limiting issues
   - Quota exceeded errors
   - Network timeouts
   - Response body error messages

3. **Response Format Issues**
   - Missing candidates in response
   - Missing content or parts arrays
   - No audio data in inlineData fields
   - Unexpected response structure

4. **Text Processing Issues**
   - Empty or invalid text inputs
   - Text cleaning failures
   - Character limit violations

5. **Audio Generation Issues**
   - Which segments failed to generate
   - Whether multi-speaker or single-speaker failed
   - PCM splitting failures
   - WAV conversion issues

6. **Batch Processing Issues**
   - How many segments succeeded/failed
   - Which specific segments have no audio
   - Fallback mechanism triggers

## Error Messages to Look For

When generation fails, check the console for these patterns:

```
[GeminiTTS] CRITICAL: No API key found!
[GeminiTTS] API error response: { status: 401... }
[GeminiTTS] API error response: { status: 429... } (rate limit)
[GeminiTTS] No audio data found in response
[Audio] Segment X (ID): NO RESULT from multi-speaker API
[Podcast X] Segments WITHOUT audio URLs: [...]
[Podcast X] CRITICAL: No audio URLs generated for ANY segment
```

## Testing the Improvements

1. Trigger a podcast generation
2. Monitor the server console for detailed logs
3. Look for the specific failure point in the chain:
   - API key validation
   - HTTP request/response
   - Response parsing
   - Audio data extraction
   - Segment processing

## Example Log Flow (Success Case)

```
[Podcast ABC] Starting audio generation: { validBatchSize: 10, provider: 'gemini', hasGeminiKey: true }
[Audio] generateMultiVoiceAudio START: { segmentCount: 10, language: 'en' }
[Audio] Text cleaning complete: { totalSegments: 10, emptyTexts: 0, nonEmptyTexts: 10 }
[Audio] Grouped 10 segments into 3 multi-speaker chunks
[Audio] Processing multi-speaker chunk: 4 valid inputs from 4 total segments
[GeminiTTS] generateGeminiMultiSpeakerChunk called: { segmentCount: 4 }
[GeminiTTS] getGeminiKey check: { hasGeminiApiKey: true, usingKey: 'AIzaSy...' }
[GeminiTTS] Calling Gemini TTS API...
[GeminiTTS] API response received: { status: 200, ok: true }
[GeminiTTS] API response parsed: { hasCandidates: true, candidatesCount: 1 }
[GeminiTTS] Audio data extracted successfully: { audioBase64Length: 245760 }
[GeminiTTS] splitPcmByWordCount complete: { resultCount: 4, allHaveAudioUrls: true }
[Audio] Multi-speaker chunk generated successfully
[Audio] generateMultiVoiceAudio COMPLETE: { successCount: 10, failedCount: 0 }
[Podcast ABC] Audio generation completed for batch
[Podcast ABC] Batch results summary: { segmentsWithAudio: 10, segmentsWithoutAudio: 0 }
```

## Example Log Flow (Failure Case)

```
[Podcast ABC] Starting audio generation: { hasGeminiKey: false, geminiKeyPrefix: 'none' }
[GeminiTTS] getGeminiKey check: { hasGeminiApiKey: false, hasGoogleApiKey: false }
[GeminiTTS] CRITICAL: No API key found! Check environment variables.
[Audio] Single-speaker generation failed: { error: 'GEMINI_API_KEY (AI Studio) is not set' }
[Podcast ABC] CRITICAL: No audio URLs generated for ANY segment in batch!
[Podcast ABC] Audio generation FAILED: { errorMessage: 'Audio generation failed: ...' }
```

## Next Steps

When you see a failure:

1. Check the **earliest error** in the log chain
2. Verify GEMINI_API_KEY is set: `echo $GEMINI_API_KEY`
3. Check API quota at: https://aistudio.google.com/app/apikey
4. Look for HTTP error codes (401, 429, 500)
5. Check if specific segments fail consistently
6. Verify text content isn't causing issues

## Files Modified

- ✅ `lib/intelligent-podcast/google-tts-client.ts` - Core TTS client with API call logging
- ✅ `lib/intelligent-podcast/audio-generator.ts` - Orchestration layer with chunk processing logs
- ✅ `app/api/intelligent-podcast/[id]/process/route.ts` - Main endpoint with batch result logs
