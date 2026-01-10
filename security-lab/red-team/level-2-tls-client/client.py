#!/usr/bin/env python3
"""
Level 2: tls_client with Custom HTTP/2 Settings

This level uses tls_client for more control over TLS parameters
and customizes HTTP/2 SETTINGS to better match Chrome.

Detection hints for students:
- Even with matching JA4 and H2 settings, TCP-level fingerprint may differ
- Request patterns and timing still reveal automation
- Cross-layer correlation (JA4 vs OS in UA vs TCP TTL)
"""

try:
    from tls_client import Session
except ImportError:
    print("tls_client not installed. Install with: pip install tls-client")
    exit(1)

import time
import random
import json

TARGET_URL = "https://localhost:8443"
DETECTION_API = "http://localhost:5000"

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Chrome's HTTP/2 SETTINGS (Akamai fingerprint style)
CHROME_H2_SETTINGS = {
    "HEADER_TABLE_SIZE": 65536,
    "ENABLE_PUSH": 0,
    "MAX_CONCURRENT_STREAMS": 1000,
    "INITIAL_WINDOW_SIZE": 6291456,
    "MAX_FRAME_SIZE": 16384,
    "MAX_HEADER_LIST_SIZE": 262144
}


def create_session():
    """Create tls_client session with Chrome configuration."""

    return Session(
        client_identifier="chrome_120",
        random_tls_extension_order=True,  # Chrome randomizes since v110

        # Custom HTTP/2 settings
        h2_settings=CHROME_H2_SETTINGS,

        # Pseudo-header order (Chrome style)
        pseudo_header_order=[
            ":method",
            ":authority",
            ":scheme",
            ":path"
        ],

        # Connection flow
        connection_flow=15663105,

        # Header order matters for H2 fingerprinting
        header_order=[
            "accept",
            "accept-encoding",
            "accept-language",
            "cache-control",
            "sec-ch-ua",
            "sec-ch-ua-mobile",
            "sec-ch-ua-platform",
            "sec-fetch-dest",
            "sec-fetch-mode",
            "sec-fetch-site",
            "sec-fetch-user",
            "upgrade-insecure-requests",
            "user-agent"
        ]
    )


def make_requests(count: int = 10):
    """Make requests with advanced impersonation."""

    print("=" * 60)
    print("Level 2: tls_client with Custom HTTP/2 Settings")
    print("=" * 60)
    print()
    print("This client configures both TLS and HTTP/2 to match Chrome.")
    print("Detection requires multi-layer analysis.")
    print()

    session = create_session()

    # Simulate more realistic browsing patterns
    paths = [
        "/",
        "/products",
        "/products/item-1",
        "/cart",
        "/about",
        "/contact"
    ]

    for i in range(count):
        try:
            path = random.choice(paths)

            response = session.get(
                f"{TARGET_URL}{path}",
                headers={
                    "User-Agent": CHROME_UA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Cache-Control": "no-cache",
                    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Sec-Fetch-User": "?1",
                }
            )
            print(f"Request {i+1}: GET {path} -> {response.status_code}")

            # More human-like delays with occasional longer pauses
            if random.random() < 0.2:
                # Occasional "reading" pause
                time.sleep(random.uniform(3.0, 8.0))
            else:
                time.sleep(random.uniform(0.5, 2.5))

        except Exception as e:
            print(f"Request {i+1} failed: {e}")


def test_detection():
    """Test detection API."""

    # Simulate a realistic browsing session
    base_time = time.time()
    delays = []
    current = 0

    for _ in range(15):
        if random.random() < 0.2:
            delay = random.uniform(3.0, 8.0)  # Reading time
        else:
            delay = random.uniform(0.5, 2.5)
        current += delay
        delays.append(base_time + current)

    test_data = {
        "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
        "user_agent": CHROME_UA,
        "session_data": {
            "request_times": delays,
            "request_paths": [
                "/", "/products", "/products/item-1",
                "/products/item-2", "/cart", "/checkout",
                "/", "/about", "/contact",
                "/products", "/products/item-3", "/cart",
                "/checkout", "/thank-you", "/"
            ]
        }
    }

    print()
    print("Testing detection API with realistic session...")
    print(f"Session duration: {delays[-1] - delays[0]:.1f}s")
    print(f"Request count: {len(delays)}")

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

        print()
        print("Signals analyzed:")
        for signal, data in result.get('signals', {}).items():
            print(f"  {signal}: {json.dumps(data, indent=4)[:200]}")

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
