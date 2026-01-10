#!/usr/bin/env python3
"""
Assignment 1: JA4 Fingerprint Extractor

YOUR NAME: _______________
DATE: _______________

Instructions:
1. Complete all TODO sections
2. Test against provided pcap files
3. Compare output with reference implementation
"""

import hashlib
import struct
import sys
from dataclasses import dataclass
from typing import Optional, List, Tuple

# ============================================
# Constants (provided - do not modify)
# ============================================

# GREASE values to filter out (RFC 8701)
GREASE_VALUES = {
    0x0a0a, 0x1a1a, 0x2a2a, 0x3a3a, 0x4a4a, 0x5a5a,
    0x6a6a, 0x7a7a, 0x8a8a, 0x9a9a, 0xaaaa, 0xbaba,
    0xcaca, 0xdada, 0xeaea, 0xfafa
}

# TLS version codes
TLS_VERSIONS = {
    0x0304: "13",  # TLS 1.3
    0x0303: "12",  # TLS 1.2
    0x0302: "11",  # TLS 1.1
    0x0301: "10",  # TLS 1.0
}

# Extension type codes
EXT_SNI = 0x0000
EXT_ALPN = 0x0010


# ============================================
# Data Classes (provided)
# ============================================

@dataclass
class ClientHello:
    """Parsed TLS ClientHello message."""
    version: int
    cipher_suites: List[int]
    extensions: List[int]
    sni: Optional[str] = None
    alpn_protocols: List[str] = None
    signature_algorithms: List[int] = None


@dataclass
class JA4Fingerprint:
    """Complete JA4 fingerprint."""
    full: str  # Complete fingerprint: a_b_c
    a: str     # Readable metadata
    b: str     # Cipher hash
    c: str     # Extension hash


# ============================================
# Helper Functions
# ============================================

def is_grease(value: int) -> bool:
    """
    Check if a value is a GREASE value.

    TODO: Implement this function
    Hint: Check if value is in GREASE_VALUES set
    """
    # YOUR CODE HERE
    pass


def compute_hash(data: str) -> str:
    """
    Compute truncated SHA256 hash (first 12 hex chars).

    TODO: Implement this function
    Hint: Use hashlib.sha256(), encode string to bytes, get hexdigest, truncate
    """
    # YOUR CODE HERE
    pass


def get_tls_version(version: int) -> str:
    """
    Convert TLS version number to JA4 format.

    TODO: Implement this function
    Hint: Use TLS_VERSIONS dict, return "00" for unknown
    """
    # YOUR CODE HERE
    pass


def get_alpn_code(alpn_protocols: List[str]) -> str:
    """
    Get ALPN code (first and last alphanumeric character).

    Examples:
        ["h2"] -> "h2"
        ["http/1.1"] -> "h1"
        [] -> "00"

    TODO: Implement this function
    """
    # YOUR CODE HERE
    pass


# ============================================
# JA4 Calculation (main assignment)
# ============================================

def calculate_ja4_section_a(client_hello: ClientHello) -> str:
    """
    Calculate JA4 section A (readable metadata).

    Format: [protocol][version][sni][cipher_count][ext_count][alpn]

    Example: t13d1516h2
    - t = TLS over TCP
    - 13 = TLS 1.3
    - d = domain (SNI present)
    - 15 = 15 cipher suites (excluding GREASE)
    - 16 = 16 extensions (excluding GREASE)
    - h2 = ALPN is HTTP/2

    TODO: Implement this function
    """
    # Protocol is always 't' for TLS over TCP
    protocol = "t"

    # TODO: Get TLS version string
    version_str = None  # YOUR CODE HERE

    # TODO: Check SNI presence ('d' if present, 'i' if not)
    sni_char = None  # YOUR CODE HERE

    # TODO: Count cipher suites (excluding GREASE, max 99)
    cipher_count = None  # YOUR CODE HERE

    # TODO: Count extensions (excluding GREASE, max 99)
    ext_count = None  # YOUR CODE HERE

    # TODO: Get ALPN code
    alpn_code = None  # YOUR CODE HERE

    # TODO: Build and return section A string
    # Format: protocol + version + sni + cipher_count(2 digits) + ext_count(2 digits) + alpn
    return None  # YOUR CODE HERE


def calculate_ja4_section_b(client_hello: ClientHello) -> str:
    """
    Calculate JA4 section B (cipher hash).

    Steps:
    1. Filter out GREASE ciphers
    2. Sort cipher values numerically
    3. Join with commas in hex format (4 digits each)
    4. Compute SHA256 hash, take first 12 chars

    TODO: Implement this function
    """
    # TODO: Filter GREASE values from cipher_suites
    real_ciphers = None  # YOUR CODE HERE

    # TODO: Sort numerically
    sorted_ciphers = None  # YOUR CODE HERE

    # TODO: Format as comma-separated hex (e.g., "1301,1302,1303")
    cipher_string = None  # YOUR CODE HERE

    # TODO: Compute and return truncated hash
    return None  # YOUR CODE HERE


def calculate_ja4_section_c(client_hello: ClientHello) -> str:
    """
    Calculate JA4 section C (extension hash).

    Steps:
    1. Filter out GREASE extensions
    2. Filter out SNI (0x0000) and ALPN (0x0010)
    3. Sort extension values numerically
    4. Join with commas in hex format
    5. Append signature algorithms (NOT sorted, with underscore separator)
    6. Compute SHA256 hash, take first 12 chars

    TODO: Implement this function
    """
    # TODO: Filter GREASE values
    real_extensions = None  # YOUR CODE HERE

    # TODO: Also filter out SNI (EXT_SNI) and ALPN (EXT_ALPN)
    filtered_extensions = None  # YOUR CODE HERE

    # TODO: Sort numerically
    sorted_extensions = None  # YOUR CODE HERE

    # TODO: Format as comma-separated hex
    ext_string = None  # YOUR CODE HERE

    # TODO: If signature_algorithms exists, append with underscore
    # Format: ext_string + "_" + sig_algs_string
    combined = None  # YOUR CODE HERE

    # TODO: Compute and return truncated hash
    return None  # YOUR CODE HERE


def calculate_ja4(client_hello: ClientHello) -> JA4Fingerprint:
    """
    Calculate complete JA4 fingerprint.

    TODO: Implement this function using the section calculators above
    """
    section_a = calculate_ja4_section_a(client_hello)
    section_b = calculate_ja4_section_b(client_hello)
    section_c = calculate_ja4_section_c(client_hello)

    # TODO: Combine into full fingerprint (a_b_c format)
    full = None  # YOUR CODE HERE

    return JA4Fingerprint(
        full=full,
        a=section_a,
        b=section_b,
        c=section_c
    )


# ============================================
# PCAP Parsing (provided - study this code)
# ============================================

def extract_from_pcap(pcap_path: str) -> List[Tuple[str, JA4Fingerprint]]:
    """
    Extract JA4 fingerprints from pcap file.

    This function is provided for you. Study it to understand
    how ClientHello messages are extracted from packets.
    """
    try:
        from scapy.all import rdpcap, IP
        from scapy.layers.tls.handshake import TLSClientHello
        from scapy.layers.tls.record import TLS
    except ImportError:
        print("Error: scapy required. Install: pip install scapy")
        return []

    results = []
    packets = rdpcap(pcap_path)

    for pkt in packets:
        if pkt.haslayer(TLS) and pkt.haslayer(TLSClientHello):
            try:
                ch = pkt[TLSClientHello]

                # Build ClientHello object
                client_hello = ClientHello(
                    version=ch.version,
                    cipher_suites=list(ch.ciphers) if ch.ciphers else [],
                    extensions=[e.type for e in ch.ext] if ch.ext else [],
                    sni=None,
                    alpn_protocols=[],
                    signature_algorithms=[]
                )

                # Extract extension data
                if ch.ext:
                    for ext in ch.ext:
                        if ext.type == EXT_SNI:
                            try:
                                client_hello.sni = ext.servernames[0].servername.decode()
                            except:
                                pass
                        elif ext.type == EXT_ALPN:
                            try:
                                client_hello.alpn_protocols = [
                                    p.decode() for p in ext.protocols
                                ]
                            except:
                                pass
                        elif ext.type == 0x000d:  # signature_algorithms
                            try:
                                client_hello.signature_algorithms = list(ext.sig_algs)
                            except:
                                pass

                # Calculate fingerprint
                ja4 = calculate_ja4(client_hello)
                source_ip = pkt[IP].src if pkt.haslayer(IP) else "unknown"
                results.append((source_ip, ja4))

            except Exception as e:
                print(f"Error: {e}", file=sys.stderr)

    return results


# ============================================
# Main Entry Point
# ============================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python starter.py <pcap_file>")
        print()
        print("Example:")
        print("  python starter.py /pcaps/test/chrome-120.pcap")
        sys.exit(1)

    pcap_path = sys.argv[1]
    print(f"Extracting JA4 fingerprints from: {pcap_path}")
    print("-" * 60)

    results = extract_from_pcap(pcap_path)

    if not results:
        print("No TLS ClientHello messages found.")
        print("Make sure scapy is installed and pcap contains TLS traffic.")
        return

    for source_ip, ja4 in results:
        print(f"Source: {source_ip}")
        print(f"  JA4:   {ja4.full}")
        print(f"  JA4_a: {ja4.a}")
        print(f"  JA4_b: {ja4.b}")
        print(f"  JA4_c: {ja4.c}")
        print()

    print(f"Total fingerprints: {len(results)}")


if __name__ == "__main__":
    main()
