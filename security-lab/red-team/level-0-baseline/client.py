#!/usr/bin/env python3
"""
Level 0: Baseline Python Requests

This is the easiest case for students to detect.
Default Python requests library has a very distinctive TLS fingerprint.

Expected JA4: t12d0909h1_* (TLS 1.2, 9 ciphers, HTTP/1.1)
User-Agent: python-requests/2.x (honest)

Detection should be trivial - exact JA4 match in database.
"""

import requests
import time
import random

TARGET_URL = "https://localhost:8443"
DETECTION_API = "http://localhost:5000"


def make_requests(count: int = 10):
    """Make requests using default Python requests library."""

    print("=" * 60)
    print("Level 0: Default Python Requests")
    print("=" * 60)
    print()
    print("This client uses default Python requests library.")
    print("TLS fingerprint will be obviously Python, not a browser.")
    print()

    session = requests.Session()

    for i in range(count):
        try:
            # Simple GET request with default settings
            response = session.get(
                TARGET_URL,
                verify=False,  # For lab self-signed certs
                timeout=10
            )
            print(f"Request {i+1}: {response.status_code}")

            # Random delay (but still looks automated)
            time.sleep(random.uniform(0.1, 0.5))

        except Exception as e:
            print(f"Request {i+1} failed: {e}")


def test_detection():
    """Test if the detection API catches this client."""

    # These are the expected fingerprint characteristics
    # Actual JA4 depends on Python/OpenSSL version
    test_data = {
        "ja4": "t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8",  # Example Python JA4
        "user_agent": requests.utils.default_user_agent(),
        "session_data": {
            "request_times": [time.time() + i * 0.3 for i in range(10)],
            "request_paths": ["/"] * 10
        }
    }

    print()
    print("Testing detection API...")
    print(f"User-Agent: {test_data['user_agent']}")
    print(f"JA4: {test_data['ja4']}")

    try:
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
