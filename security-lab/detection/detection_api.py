#!/usr/bin/env python3
"""
TLS Fingerprint Detection API

REST API for fingerprint analysis and anomaly detection.
Used by students to submit fingerprints and receive detection scores.

Endpoints:
    POST /analyze     - Analyze a fingerprint
    GET /fingerprint/<ja4> - Lookup known fingerprint
    GET /stats        - Detection statistics
"""

import os
import re
from datetime import datetime
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

# Database connection
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://labuser:labpass123@localhost:5432/fingerprints'
)


def get_db():
    """Get database connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


# ============================================
# Detection Logic
# ============================================

# Known browser JA4_a patterns (first component)
BROWSER_PATTERNS = {
    'chrome': re.compile(r't13d1[4-7]\d{2}h2'),
    'firefox': re.compile(r't13d1[3-5]\d{2}h2'),
    'safari': re.compile(r't13d1[2-4]\d{2}h2'),
    'edge': re.compile(r't13d1[4-7]\d{2}h2'),  # Similar to Chrome
}

# Known automation tool patterns
AUTOMATION_PATTERNS = {
    'python_requests': re.compile(r't1[012]d0[89]\d{2}h1'),
    'curl': re.compile(r't1[012]d0[78]\d{2}h1'),
    'go_http': re.compile(r't13d1[012]\d{2}h2'),
}


def parse_ja4(ja4: str) -> dict:
    """Parse JA4 into components."""
    parts = ja4.split('_')
    if len(parts) != 3:
        return None

    ja4_a = parts[0]

    # Parse the 'a' component
    return {
        'full': ja4,
        'a': ja4_a,
        'b': parts[1],
        'c': parts[2],
        'protocol': ja4_a[0] if len(ja4_a) > 0 else None,
        'tls_version': ja4_a[1:3] if len(ja4_a) > 2 else None,
        'sni': ja4_a[3] if len(ja4_a) > 3 else None,
        'cipher_count': int(ja4_a[4:6]) if len(ja4_a) > 5 else None,
        'ext_count': int(ja4_a[6:8]) if len(ja4_a) > 7 else None,
        'alpn': ja4_a[8:10] if len(ja4_a) > 9 else None,
    }


def extract_browser_from_ua(user_agent: str) -> Optional[str]:
    """Extract browser name from User-Agent string."""
    if not user_agent:
        return None

    ua_lower = user_agent.lower()

    # Order matters - check more specific first
    if 'edg/' in ua_lower or 'edge/' in ua_lower:
        return 'edge'
    if 'chrome/' in ua_lower and 'chromium' not in ua_lower:
        return 'chrome'
    if 'firefox/' in ua_lower:
        return 'firefox'
    if 'safari/' in ua_lower and 'chrome/' not in ua_lower:
        return 'safari'
    if 'python' in ua_lower:
        return 'python'
    if 'curl/' in ua_lower:
        return 'curl'
    if 'go-http' in ua_lower:
        return 'go'

    return 'unknown'


def detect_ua_fingerprint_mismatch(ja4: str, user_agent: str) -> dict:
    """
    Detect mismatch between claimed User-Agent and TLS fingerprint.

    Returns:
        dict with 'mismatch' (bool), 'score' (0-1), 'reason' (str)
    """
    parsed = parse_ja4(ja4)
    if not parsed:
        return {'mismatch': False, 'score': 0, 'reason': 'Invalid JA4'}

    claimed_browser = extract_browser_from_ua(user_agent)
    ja4_a = parsed['a']

    result = {
        'mismatch': False,
        'score': 0.0,
        'reason': None,
        'claimed': claimed_browser,
        'fingerprint_suggests': None
    }

    # Check what the fingerprint suggests
    fingerprint_browser = None
    for browser, pattern in BROWSER_PATTERNS.items():
        if pattern.match(ja4_a):
            fingerprint_browser = browser
            break

    for tool, pattern in AUTOMATION_PATTERNS.items():
        if pattern.match(ja4_a):
            fingerprint_browser = tool
            break

    result['fingerprint_suggests'] = fingerprint_browser

    # Detect mismatches
    if claimed_browser in ['chrome', 'firefox', 'safari', 'edge']:
        # Claiming to be a browser
        if fingerprint_browser in ['python_requests', 'curl', 'go_http']:
            result['mismatch'] = True
            result['score'] = 0.9
            result['reason'] = f"Claims {claimed_browser} but fingerprint matches {fingerprint_browser}"
        elif fingerprint_browser and fingerprint_browser != claimed_browser:
            # Different browser
            if claimed_browser == 'edge' and fingerprint_browser == 'chrome':
                # Edge uses Chromium, this is OK
                pass
            else:
                result['mismatch'] = True
                result['score'] = 0.5
                result['reason'] = f"Claims {claimed_browser} but fingerprint matches {fingerprint_browser}"

    elif claimed_browser in ['python', 'curl', 'go']:
        # Honest about being a tool - that's fine
        pass

    else:
        # Unknown UA
        result['score'] = 0.2
        result['reason'] = "Unknown or missing User-Agent"

    return result


def detect_behavioral_anomalies(session_data: dict) -> dict:
    """
    Detect behavioral anomalies in session data.

    Expected session_data:
        - request_times: list of timestamps
        - request_paths: list of paths requested
    """
    result = {
        'anomalies': [],
        'score': 0.0
    }

    request_times = session_data.get('request_times', [])
    if len(request_times) < 2:
        return result

    # Calculate inter-request delays
    delays = []
    for i in range(1, len(request_times)):
        delay = request_times[i] - request_times[i-1]
        delays.append(delay)

    if not delays:
        return result

    avg_delay = sum(delays) / len(delays)
    min_delay = min(delays)
    max_delay = max(delays)

    # Calculate variance
    variance = sum((d - avg_delay) ** 2 for d in delays) / len(delays)

    # Anomaly: Superhuman speed
    if min_delay < 0.05:  # < 50ms
        result['anomalies'].append({
            'type': 'superhuman_speed',
            'detail': f'Min delay: {min_delay*1000:.1f}ms',
            'severity': 'high'
        })
        result['score'] += 0.4

    # Anomaly: Too consistent (low variance suggests automation)
    if variance < 0.01 and len(delays) > 5:
        result['anomalies'].append({
            'type': 'consistent_timing',
            'detail': f'Variance: {variance:.6f}',
            'severity': 'medium'
        })
        result['score'] += 0.3

    # Anomaly: High request rate
    total_time = request_times[-1] - request_times[0] if request_times else 0
    if total_time > 0:
        rate = len(request_times) / total_time
        if rate > 10:  # > 10 requests per second sustained
            result['anomalies'].append({
                'type': 'high_request_rate',
                'detail': f'Rate: {rate:.1f} req/s',
                'severity': 'high'
            })
            result['score'] += 0.3

    result['score'] = min(result['score'], 1.0)
    return result


def calculate_combined_score(
    ja4: str,
    user_agent: str,
    session_data: Optional[dict] = None
) -> dict:
    """
    Calculate combined detection score from multiple signals.

    Returns comprehensive analysis result.
    """
    result = {
        'ja4': ja4,
        'user_agent': user_agent,
        'timestamp': datetime.utcnow().isoformat(),
        'signals': {},
        'total_score': 0.0,
        'classification': 'unknown',
        'reasons': []
    }

    # Signal 1: UA/Fingerprint mismatch
    ua_check = detect_ua_fingerprint_mismatch(ja4, user_agent)
    result['signals']['ua_fingerprint'] = ua_check
    if ua_check['mismatch']:
        result['total_score'] += ua_check['score'] * 0.5
        result['reasons'].append(ua_check['reason'])

    # Signal 2: Known fingerprint lookup
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM known_fingerprints WHERE ja4 = %s
            """, (ja4,))
            known = cur.fetchone()

            if known:
                result['signals']['known_fingerprint'] = {
                    'found': True,
                    'application': known['application'],
                    'is_browser': known['is_browser'],
                    'is_malicious': known['is_malicious']
                }

                if known['is_malicious']:
                    result['total_score'] += 0.8
                    result['reasons'].append(f"Known malicious fingerprint: {known['application']}")
            else:
                result['signals']['known_fingerprint'] = {'found': False}
                result['total_score'] += 0.1
                result['reasons'].append("Unknown fingerprint")

    # Signal 3: Behavioral analysis (if session data provided)
    if session_data:
        behavioral = detect_behavioral_anomalies(session_data)
        result['signals']['behavioral'] = behavioral
        result['total_score'] += behavioral['score'] * 0.4
        for anomaly in behavioral['anomalies']:
            result['reasons'].append(f"Behavioral: {anomaly['type']}")

    # Final classification
    result['total_score'] = min(result['total_score'], 1.0)

    if result['total_score'] >= 0.7:
        result['classification'] = 'blocked'
    elif result['total_score'] >= 0.4:
        result['classification'] = 'suspicious'
    else:
        result['classification'] = 'legitimate'

    return result


# ============================================
# API Endpoints
# ============================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze a fingerprint for anomalies.

    Request body:
        {
            "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
            "user_agent": "Mozilla/5.0 ...",
            "source_ip": "1.2.3.4",
            "session_data": {  // optional
                "request_times": [1704067200.0, 1704067200.5, ...],
                "request_paths": ["/", "/api/data", ...]
            }
        }
    """
    data = request.get_json()

    if not data or 'ja4' not in data:
        return jsonify({'error': 'ja4 field required'}), 400

    ja4 = data['ja4']
    user_agent = data.get('user_agent', '')
    source_ip = data.get('source_ip', request.remote_addr)
    session_data = data.get('session_data')

    # Validate JA4 format
    if not re.match(r'^[a-z]\d{2}[di]\d{4}[a-z0-9]{2}_[a-f0-9]{12}_[a-f0-9]{12}$', ja4):
        return jsonify({'error': 'Invalid JA4 format'}), 400

    result = calculate_combined_score(ja4, user_agent, session_data)
    result['source_ip'] = source_ip

    # Store observation
    try:
        parsed = parse_ja4(ja4)
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO observed_fingerprints
                    (ja4, ja4_a, ja4_b, ja4_c, source_ip, user_agent,
                     anomaly_score, classification, detection_reasons)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ja4, source_ip) DO UPDATE SET
                        hit_count = observed_fingerprints.hit_count + 1,
                        last_seen = CURRENT_TIMESTAMP
                """, (
                    ja4, parsed['a'], parsed['b'], parsed['c'],
                    source_ip, user_agent,
                    result['total_score'], result['classification'],
                    result['reasons']
                ))
                conn.commit()
    except Exception as e:
        app.logger.error(f"Database error: {e}")

    return jsonify(result)


@app.route('/fingerprint/<ja4>', methods=['GET'])
def lookup_fingerprint(ja4: str):
    """
    Lookup a fingerprint in the known database.

    Returns information about the fingerprint if known.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            # Check known fingerprints
            cur.execute("""
                SELECT * FROM known_fingerprints WHERE ja4 = %s
            """, (ja4,))
            known = cur.fetchone()

            # Check observed fingerprints
            cur.execute("""
                SELECT * FROM observed_fingerprints WHERE ja4 = %s
                ORDER BY last_seen DESC LIMIT 10
            """, (ja4,))
            observations = cur.fetchall()

    return jsonify({
        'ja4': ja4,
        'known': dict(known) if known else None,
        'observations': [dict(o) for o in observations],
        'observation_count': len(observations)
    })


@app.route('/stats', methods=['GET'])
def get_stats():
    """Get detection statistics."""
    with get_db() as conn:
        with conn.cursor() as cur:
            # Total observations
            cur.execute("SELECT COUNT(*) as count FROM observed_fingerprints")
            total = cur.fetchone()['count']

            # By classification
            cur.execute("""
                SELECT classification, COUNT(*) as count
                FROM observed_fingerprints
                GROUP BY classification
            """)
            by_class = {row['classification']: row['count'] for row in cur.fetchall()}

            # Top fingerprints
            cur.execute("""
                SELECT ja4, ja4_a, COUNT(*) as count,
                       AVG(anomaly_score) as avg_score
                FROM observed_fingerprints
                GROUP BY ja4, ja4_a
                ORDER BY count DESC
                LIMIT 10
            """)
            top_fps = [dict(row) for row in cur.fetchall()]

            # Recent high-risk
            cur.execute("""
                SELECT * FROM high_risk_observations LIMIT 10
            """)
            high_risk = [dict(row) for row in cur.fetchall()]

    return jsonify({
        'total_observations': total,
        'by_classification': by_class,
        'top_fingerprints': top_fps,
        'recent_high_risk': high_risk
    })


@app.route('/test-evasion', methods=['POST'])
def test_evasion():
    """
    Test endpoint for red team evasion attempts.

    Submit fingerprint data and see if it passes detection.
    Returns detailed feedback for educational purposes.
    """
    data = request.get_json()

    if not data or 'ja4' not in data:
        return jsonify({'error': 'ja4 field required'}), 400

    result = calculate_combined_score(
        data['ja4'],
        data.get('user_agent', ''),
        data.get('session_data')
    )

    # Add educational feedback
    feedback = []

    if result['total_score'] < 0.3:
        feedback.append("Your evasion attempt passed basic detection!")
        feedback.append("However, real-world systems may use additional signals.")
    elif result['total_score'] < 0.6:
        feedback.append("Suspicious but not blocked. Detected issues:")
        for reason in result['reasons']:
            feedback.append(f"  - {reason}")
    else:
        feedback.append("Blocked! Your evasion attempt was detected:")
        for reason in result['reasons']:
            feedback.append(f"  - {reason}")
        feedback.append("Hint: Check UA/fingerprint consistency and timing patterns.")

    result['educational_feedback'] = feedback
    return jsonify(result)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
