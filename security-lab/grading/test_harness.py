#!/usr/bin/env python3
"""
Test Harness for Security Lab Assignments

Run student implementations against test cases and generate grades.

Usage:
    python test_harness.py --assignment 1 --submission ./student_code.py
    python test_harness.py --assignment 3 --submission ./detector.py --verbose
"""

import argparse
import importlib.util
import json
import sys
from dataclasses import dataclass
from typing import Callable, List, Dict, Any

# ============================================
# Test Cases
# ============================================

# Assignment 1: JA4 Extractor test cases
JA4_TEST_CASES = [
    {
        "name": "Chrome-like fingerprint",
        "input": {
            "version": 0x0303,
            "cipher_suites": [0x1301, 0x1302, 0x1303, 0xc02c, 0xc02b, 0x0a0a],  # includes GREASE
            "extensions": [0x0000, 0x0010, 0x002b, 0x000d, 0x0033, 0x1a1a],  # includes GREASE
            "sni": "example.com",
            "alpn_protocols": ["h2", "http/1.1"],
            "signature_algorithms": [0x0403, 0x0503, 0x0603]
        },
        "expected_a_prefix": "t12d",  # TLS 1.2 from version field
        "expected_a_contains": ["d", "h2"],  # SNI present, HTTP/2
        "points": 20
    },
    {
        "name": "No SNI fingerprint",
        "input": {
            "version": 0x0303,
            "cipher_suites": [0x1301, 0x1302],
            "extensions": [0x002b],
            "sni": None,
            "alpn_protocols": [],
            "signature_algorithms": []
        },
        "expected_a_contains": ["i", "00"],  # No SNI, no ALPN
        "points": 15
    },
    {
        "name": "GREASE filtering",
        "input": {
            "version": 0x0304,
            "cipher_suites": [0x0a0a, 0x1301, 0x2a2a, 0x1302, 0x3a3a],  # 3 GREASE, 2 real
            "extensions": [0x1a1a, 0x0000, 0x2a2a],  # 2 GREASE, 1 real
            "sni": "test.com",
            "alpn_protocols": ["h2"],
            "signature_algorithms": []
        },
        "expected_cipher_count": 2,  # After GREASE removal
        "expected_ext_count": 1,     # After GREASE removal
        "points": 25
    }
]

# Assignment 3: Anomaly Detection test cases
ANOMALY_TEST_CASES = [
    {
        "name": "Obvious Python spoofing Chrome",
        "input": {
            "ja4": "t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8",
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
        },
        "expected_mismatch": True,
        "min_confidence": 0.7,
        "points": 25
    },
    {
        "name": "Legitimate Chrome",
        "input": {
            "ja4": "t13d1516h2_8daaf6152771_e5627efa2ab1",
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
        },
        "expected_mismatch": False,
        "max_confidence": 0.3,
        "points": 20
    },
    {
        "name": "Honest Python client",
        "input": {
            "ja4": "t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8",
            "user_agent": "python-requests/2.31.0"
        },
        "expected_mismatch": False,
        "points": 20
    },
    {
        "name": "curl spoofing Firefox",
        "input": {
            "ja4": "t12d0808h1_4c6bb18e1b2d_de96e3e8b5c9",
            "user_agent": "Mozilla/5.0 Firefox/120.0"
        },
        "expected_mismatch": True,
        "min_confidence": 0.6,
        "points": 20
    },
    {
        "name": "TLS 1.2 claiming modern browser",
        "input": {
            "ja4": "t12d1015h1_abcd12345678_efgh87654321",
            "user_agent": "Mozilla/5.0 Chrome/125.0.0.0"
        },
        "expected_mismatch": True,  # Modern Chrome uses TLS 1.3
        "points": 15
    }
]


@dataclass
class TestResult:
    name: str
    passed: bool
    points_earned: float
    points_possible: float
    message: str


def load_student_module(path: str):
    """Dynamically load student's Python module."""
    spec = importlib.util.spec_from_file_location("student_module", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_ja4_tests(module, verbose: bool = False) -> List[TestResult]:
    """Run Assignment 1 tests."""
    results = []

    # Check required functions exist
    required = ['calculate_ja4', 'is_grease', 'compute_hash']
    for func in required:
        if not hasattr(module, func):
            results.append(TestResult(
                name=f"Function {func} exists",
                passed=False,
                points_earned=0,
                points_possible=10,
                message=f"Missing required function: {func}"
            ))
            return results

    # Create ClientHello class if not in module
    if not hasattr(module, 'ClientHello'):
        from dataclasses import dataclass
        @dataclass
        class ClientHello:
            version: int
            cipher_suites: list
            extensions: list
            sni: str = None
            alpn_protocols: list = None
            signature_algorithms: list = None
        module.ClientHello = ClientHello

    for test in JA4_TEST_CASES:
        try:
            # Create ClientHello from test input
            ch = module.ClientHello(**test['input'])
            result = module.calculate_ja4(ch)

            passed = True
            messages = []

            # Check expected values
            if 'expected_a_prefix' in test:
                if not result.a.startswith(test['expected_a_prefix']):
                    passed = False
                    messages.append(f"JA4_a should start with {test['expected_a_prefix']}, got {result.a}")

            if 'expected_a_contains' in test:
                for expected in test['expected_a_contains']:
                    if expected not in result.a:
                        passed = False
                        messages.append(f"JA4_a should contain '{expected}'")

            if 'expected_cipher_count' in test:
                # Extract cipher count from JA4_a (positions 4-5)
                cipher_count = int(result.a[4:6])
                if cipher_count != test['expected_cipher_count']:
                    passed = False
                    messages.append(f"Cipher count should be {test['expected_cipher_count']}, got {cipher_count}")

            if 'expected_ext_count' in test:
                ext_count = int(result.a[6:8])
                if ext_count != test['expected_ext_count']:
                    passed = False
                    messages.append(f"Extension count should be {test['expected_ext_count']}, got {ext_count}")

            # Verify format
            if not result.full or '_' not in result.full:
                passed = False
                messages.append("JA4 format invalid (should be a_b_c)")

            results.append(TestResult(
                name=test['name'],
                passed=passed,
                points_earned=test['points'] if passed else 0,
                points_possible=test['points'],
                message="; ".join(messages) if messages else "OK"
            ))

            if verbose:
                print(f"  Test: {test['name']}")
                print(f"    Result: {result.full}")
                print(f"    Passed: {passed}")
                if messages:
                    print(f"    Issues: {'; '.join(messages)}")

        except Exception as e:
            results.append(TestResult(
                name=test['name'],
                passed=False,
                points_earned=0,
                points_possible=test['points'],
                message=f"Exception: {str(e)}"
            ))

    return results


def run_anomaly_tests(module, verbose: bool = False) -> List[TestResult]:
    """Run Assignment 3 tests."""
    results = []

    # Check required function
    if not hasattr(module, 'detect_anomaly'):
        results.append(TestResult(
            name="Function detect_anomaly exists",
            passed=False,
            points_earned=0,
            points_possible=10,
            message="Missing required function: detect_anomaly"
        ))
        return results

    for test in ANOMALY_TEST_CASES:
        try:
            result = module.detect_anomaly(**test['input'])

            passed = True
            messages = []

            # Check mismatch detection
            if 'expected_mismatch' in test:
                detected = result.get('mismatch_detected', False)
                if detected != test['expected_mismatch']:
                    passed = False
                    messages.append(
                        f"Expected mismatch={test['expected_mismatch']}, got {detected}"
                    )

            # Check confidence bounds
            confidence = result.get('confidence', 0)
            if 'min_confidence' in test and confidence < test['min_confidence']:
                passed = False
                messages.append(
                    f"Confidence {confidence:.2f} below minimum {test['min_confidence']}"
                )
            if 'max_confidence' in test and confidence > test['max_confidence']:
                passed = False
                messages.append(
                    f"Confidence {confidence:.2f} above maximum {test['max_confidence']}"
                )

            results.append(TestResult(
                name=test['name'],
                passed=passed,
                points_earned=test['points'] if passed else test['points'] * 0.5 if not messages else 0,
                points_possible=test['points'],
                message="; ".join(messages) if messages else "OK"
            ))

            if verbose:
                print(f"  Test: {test['name']}")
                print(f"    Result: {json.dumps(result, indent=2)}")
                print(f"    Passed: {passed}")

        except Exception as e:
            results.append(TestResult(
                name=test['name'],
                passed=False,
                points_earned=0,
                points_possible=test['points'],
                message=f"Exception: {str(e)}"
            ))

    return results


def print_report(results: List[TestResult], assignment: int):
    """Print grading report."""
    print()
    print("=" * 60)
    print(f"GRADING REPORT - Assignment {assignment}")
    print("=" * 60)
    print()

    total_earned = 0
    total_possible = 0

    for r in results:
        status = "PASS" if r.passed else "FAIL"
        print(f"[{status}] {r.name}")
        print(f"       Points: {r.points_earned:.1f}/{r.points_possible:.1f}")
        if r.message != "OK":
            print(f"       Note: {r.message}")
        print()

        total_earned += r.points_earned
        total_possible += r.points_possible

    print("-" * 60)
    percentage = (total_earned / total_possible * 100) if total_possible > 0 else 0
    print(f"TOTAL: {total_earned:.1f}/{total_possible:.1f} ({percentage:.1f}%)")

    # Letter grade
    if percentage >= 90:
        grade = "A"
    elif percentage >= 80:
        grade = "B"
    elif percentage >= 70:
        grade = "C"
    elif percentage >= 60:
        grade = "D"
    else:
        grade = "F"

    print(f"GRADE: {grade}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Grade student submissions")
    parser.add_argument("--assignment", type=int, required=True,
                        help="Assignment number (1, 3, etc.)")
    parser.add_argument("--submission", required=True,
                        help="Path to student's Python file")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show detailed output")
    parser.add_argument("--output", "-o",
                        help="Output JSON results to file")

    args = parser.parse_args()

    print(f"Loading submission: {args.submission}")
    try:
        module = load_student_module(args.submission)
    except Exception as e:
        print(f"Error loading submission: {e}")
        sys.exit(1)

    if args.assignment == 1:
        results = run_ja4_tests(module, args.verbose)
    elif args.assignment == 3:
        results = run_anomaly_tests(module, args.verbose)
    else:
        print(f"Unknown assignment: {args.assignment}")
        sys.exit(1)

    print_report(results, args.assignment)

    if args.output:
        output_data = {
            "assignment": args.assignment,
            "submission": args.submission,
            "results": [
                {
                    "name": r.name,
                    "passed": r.passed,
                    "points_earned": r.points_earned,
                    "points_possible": r.points_possible,
                    "message": r.message
                }
                for r in results
            ],
            "total_earned": sum(r.points_earned for r in results),
            "total_possible": sum(r.points_possible for r in results)
        }
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"\nResults saved to: {args.output}")


if __name__ == "__main__":
    main()
