#!/usr/bin/env python3
"""
Level 1: curl_cffi Browser Impersonation

This level uses curl_cffi to impersonate Chrome's TLS fingerprint.
Much harder to detect than baseline Python requests.

Expected JA4: t13d1516h2_* (matches Chrome pattern)
User-Agent: Chrome 120 (matching the impersonation)

Detection hints for students:
- HTTP/2 SETTINGS frame may differ from real Chrome
- Behavioral patterns (timing, navigation) may be suspicious
- Missing JavaScript execution artifacts
"""

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    print("curl_cffi not installed. Install with: pip install curl_cffi")
    print("This is intentional - students should notice the import.")
    exit(1)

import time
import random

TARGET_URL = "https://localhost:8443"
DETECTION_API = "http://localhost:5000"

# Chrome User-Agent to match impersonation
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def make_requests(count: int = 10):
    """Make requests impersonating Chrome."""

    print("=" * 60)
    print("Level 1: curl_cffi Chrome Impersonation")
    print("=" * 60)
    print()
    print("This client uses curl_cffi to impersonate Chrome's TLS fingerprint.")
    print("JA4 should look like Chrome, but other signals may differ.")
    print()

    # Create session with Chrome impersonation
    session = curl_requests.Session(impersonate="chrome120")

    for i in range(count):
        try:
            response = session.get(
                TARGET_URL,
                headers={"User-Agent": CHROME_UA},
                verify=False,
                timeout=10
            )
            print(f"Request {i+1}: {response.status_code}")

            # Slightly more human-like delays
            time.sleep(random.uniform(0.5, 2.0))

        except Exception as e:
            print(f"Request {i+1} failed: {e}")


def test_detection():
    """Test if the detection API catches this client."""

    # curl_cffi should produce Chrome-like JA4
    test_data = {
        "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",  # Chrome-like
        "user_agent": CHROME_UA,
        "session_data": {
            # Slightly more realistic timing
            "request_times": [
                time.time() + sum(random.uniform(0.5, 2.0) for _ in range(i))
                for i in range(10)
            ],
            "request_paths": ["/", "/about", "/products", "/contact"] * 3
        }
    }

    print()
    print("Testing detection API...")
    print(f"User-Agent: {test_data['user_agent'][:60]}...")
    print(f"JA4: {test_data['ja4']}")

    try:
        import requests
        response = requests.post(
            f"{DETECTION_API}/test-evasion",
            json=test_data
        )
        result = response.json()

        print()
        print("Detection Result:")
        print(f"  Score: {result['total_score']:.2f}")
        print(f"  Classification: {result['classification']}")
        print()
        print("Feedback:")
        for line in result.get('educational_feedback', []):
            print(f"  {line}")

    except Exception as e:
        print(f"Detection API error: {e}")


if __name__ == "__main__":
    import sys

    if "--test-detection" in sys.argv:
        test_detection()
    else:
        make_requests()
        print()
        print("Run with --test-detection to test against detection API")
