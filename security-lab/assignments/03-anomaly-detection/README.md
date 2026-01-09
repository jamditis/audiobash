# Assignment 3: Anomaly Detection

**Due:** Week 7
**Points:** 100

## Objective

Build a detection system that identifies mismatches between claimed User-Agent and TLS fingerprint.

## Learning Goals

- Understand how User-Agent spoofing works and its limitations
- Learn to correlate multiple signals for detection
- Practice building security detection rules

## The Problem

Attackers often spoof their User-Agent to claim they're a legitimate browser, but their TLS fingerprint reveals their true client (Python, curl, etc.).

**Example attack:**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0
JA4: t12d0909h1_3b5aa07d0a1c_...  (Python requests fingerprint!)
```

Your job: Detect this mismatch!

## Requirements

### Input
JSON object with:
```json
{
    "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
    "user_agent": "Mozilla/5.0 ... Chrome/120.0.0.0 ...",
    "source_ip": "1.2.3.4"
}
```

### Output
```json
{
    "mismatch_detected": true,
    "confidence": 0.85,
    "claimed_client": "Chrome 120",
    "fingerprint_suggests": "Python requests",
    "reasons": [
        "JA4_a pattern t12d09 matches Python, not Chrome",
        "Chrome uses TLS 1.3, fingerprint shows TLS 1.2"
    ]
}
```

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| UA parsing | 20 | Correctly extract browser name/version |
| JA4 pattern matching | 25 | Match fingerprints to known clients |
| Mismatch detection | 30 | Identify UA/fingerprint inconsistencies |
| Confidence scoring | 15 | Reasonable confidence calculation |
| Code quality | 10 | Clean, documented, handles edge cases |

## Detection Rules to Implement

1. **TLS Version Mismatch**
   - Chrome 100+ uses TLS 1.3 (`t13`)
   - Python requests defaults to TLS 1.2 (`t12`)

2. **Cipher Count Mismatch**
   - Modern browsers: 15-20 ciphers
   - Python/curl: 8-12 ciphers

3. **ALPN Mismatch**
   - Browsers: HTTP/2 (`h2`)
   - Default Python: HTTP/1.1 (`h1`)

4. **Known Fingerprint Match**
   - Check against `known_fingerprints` database
   - If JA4 matches "Python" but UA says "Chrome" = mismatch

## Test Cases

Your detector should handle:

```python
# Test 1: Obvious mismatch (should detect)
{
    "ja4": "t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8",
    "user_agent": "Mozilla/5.0 Chrome/120.0.0.0"
}
# Expected: mismatch_detected=True, confidence>0.8

# Test 2: Legitimate Chrome (should NOT detect)
{
    "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
    "user_agent": "Mozilla/5.0 Chrome/120.0.0.0"
}
# Expected: mismatch_detected=False

# Test 3: Honest Python (should NOT detect)
{
    "ja4": "t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8",
    "user_agent": "python-requests/2.31.0"
}
# Expected: mismatch_detected=False (honest client)

# Test 4: curl_cffi impersonation (harder to detect)
{
    "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
    "user_agent": "Mozilla/5.0 Chrome/120.0.0.0"
}
# This looks legitimate! Requires additional signals.
# Expected: mismatch_detected=False (or low confidence)
```

## Hints

1. Start with simple rules (TLS version, cipher count)
2. Build a database of known browser JA4 patterns
3. Consider partial matching on JA4_a only
4. Not all mismatches are malicious - prioritize high-confidence detections

## Starter Code

See `starter.py` for skeleton implementation.

## Submission

1. Your `anomaly_detector.py` implementation
2. Detection rules documentation (what rules you implemented)
3. Test results showing true/false positive rates
