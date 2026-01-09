#!/usr/bin/env python3
"""
JA4 TLS Fingerprint Extractor

Educational implementation for security lab.
Extracts JA4 fingerprints from pcap files or live traffic.

Usage:
    python ja4_extractor.py capture.pcap
    python ja4_extractor.py --live eth0
"""

import hashlib
import struct
import sys
from dataclasses import dataclass
from typing import Optional

# GREASE values (RFC 8701) - must be filtered out
GREASE_VALUES = {
    0x0a0a, 0x1a1a, 0x2a2a, 0x3a3a, 0x4a4a, 0x5a5a,
    0x6a6a, 0x7a7a, 0x8a8a, 0x9a9a, 0xaaaa, 0xbaba,
    0xcaca, 0xdada, 0xeaea, 0xfafa
}

# TLS version mapping
TLS_VERSIONS = {
    0x0304: "13",  # TLS 1.3
    0x0303: "12",  # TLS 1.2
    0x0302: "11",  # TLS 1.1
    0x0301: "10",  # TLS 1.0
    0x0300: "s3",  # SSL 3.0
    0xfefd: "d2",  # DTLS 1.2
    0xfeff: "d1",  # DTLS 1.0
}

# Extension types
EXT_SNI = 0x0000
EXT_ALPN = 0x0010
EXT_SUPPORTED_VERSIONS = 0x002b
EXT_SIGNATURE_ALGORITHMS = 0x000d


@dataclass
class ClientHello:
    """Parsed TLS ClientHello message."""
    version: int
    cipher_suites: list[int]
    extensions: list[int]
    sni: Optional[str] = None
    alpn_protocols: list[str] = None
    supported_versions: list[int] = None
    signature_algorithms: list[int] = None

    def __post_init__(self):
        if self.alpn_protocols is None:
            self.alpn_protocols = []
        if self.supported_versions is None:
            self.supported_versions = []
        if self.signature_algorithms is None:
            self.signature_algorithms = []


@dataclass
class JA4Fingerprint:
    """JA4 fingerprint with all components."""
    full: str
    a: str  # Readable metadata
    b: str  # Cipher hash
    c: str  # Extension hash

    def __str__(self):
        return self.full


def is_grease(value: int) -> bool:
    """Check if a value is a GREASE value."""
    return value in GREASE_VALUES


def get_tls_version_string(version: int) -> str:
    """Convert TLS version to JA4 format."""
    return TLS_VERSIONS.get(version, "00")


def get_alpn_code(alpn_protocols: list[str]) -> str:
    """
    Extract ALPN code (first and last alphanumeric char).

    Examples:
        'h2' -> 'h2'
        'http/1.1' -> 'h1'
        'grpc' -> 'gc'
    """
    if not alpn_protocols:
        return "00"

    first_proto = alpn_protocols[0]
    alphanumeric = ''.join(c for c in first_proto if c.isalnum())

    if len(alphanumeric) >= 2:
        return alphanumeric[0] + alphanumeric[-1]
    elif len(alphanumeric) == 1:
        return alphanumeric[0] + alphanumeric[0]
    else:
        return "00"


def compute_hash(data: str) -> str:
    """Compute truncated SHA256 hash (12 chars)."""
    return hashlib.sha256(data.encode()).hexdigest()[:12]


def calculate_ja4(client_hello: ClientHello) -> JA4Fingerprint:
    """
    Calculate JA4 fingerprint from parsed ClientHello.

    JA4 Format: a_b_c where:
    - a: protocol + version + sni + cipher_count + ext_count + alpn
    - b: SHA256(sorted ciphers)[:12]
    - c: SHA256(sorted extensions + sig_algs)[:12]
    """

    # ========================================
    # Section A: Readable metadata
    # ========================================

    # Protocol (t = TLS over TCP)
    protocol = "t"

    # TLS Version (use highest supported if available)
    if client_hello.supported_versions:
        # Filter GREASE and get highest
        real_versions = [v for v in client_hello.supported_versions if not is_grease(v)]
        version = max(real_versions) if real_versions else client_hello.version
    else:
        version = client_hello.version

    version_str = get_tls_version_string(version)

    # SNI presence
    sni_char = "d" if client_hello.sni else "i"

    # Cipher count (excluding GREASE)
    real_ciphers = [c for c in client_hello.cipher_suites if not is_grease(c)]
    cipher_count = min(len(real_ciphers), 99)

    # Extension count (excluding GREASE)
    real_extensions = [e for e in client_hello.extensions if not is_grease(e)]
    ext_count = min(len(real_extensions), 99)

    # ALPN code
    alpn_code = get_alpn_code(client_hello.alpn_protocols)

    # Build section A
    section_a = f"{protocol}{version_str}{sni_char}{cipher_count:02d}{ext_count:02d}{alpn_code}"

    # ========================================
    # Section B: Cipher hash
    # ========================================

    # Sort ciphers (JA4 normalizes by sorting)
    ciphers_sorted = sorted(real_ciphers)
    cipher_string = ",".join(f"{c:04x}" for c in ciphers_sorted)
    section_b = compute_hash(cipher_string)

    # ========================================
    # Section C: Extension hash
    # ========================================

    # Filter out SNI (0x0000) and ALPN (0x0010) from extensions
    extensions_filtered = [
        e for e in real_extensions
        if e not in (EXT_SNI, EXT_ALPN)
    ]

    # Sort extensions
    extensions_sorted = sorted(extensions_filtered)
    ext_string = ",".join(f"{e:04x}" for e in extensions_sorted)

    # Append signature algorithms (NOT sorted, original order)
    if client_hello.signature_algorithms:
        sig_string = ",".join(f"{s:04x}" for s in client_hello.signature_algorithms)
        combined = f"{ext_string}_{sig_string}"
    else:
        combined = ext_string

    section_c = compute_hash(combined)

    # ========================================
    # Build final fingerprint
    # ========================================

    full_ja4 = f"{section_a}_{section_b}_{section_c}"

    return JA4Fingerprint(
        full=full_ja4,
        a=section_a,
        b=section_b,
        c=section_c
    )


def parse_client_hello_raw(data: bytes) -> Optional[ClientHello]:
    """
    Parse raw TLS ClientHello bytes.

    This is a simplified parser for educational purposes.
    Production code should use a proper TLS parsing library.
    """
    try:
        offset = 0

        # TLS Record Header (5 bytes)
        content_type = data[offset]
        if content_type != 0x16:  # Handshake
            return None

        record_version = struct.unpack(">H", data[offset+1:offset+3])[0]
        record_length = struct.unpack(">H", data[offset+3:offset+5])[0]
        offset += 5

        # Handshake Header (4 bytes)
        handshake_type = data[offset]
        if handshake_type != 0x01:  # ClientHello
            return None

        handshake_length = struct.unpack(">I", b'\x00' + data[offset+1:offset+4])[0]
        offset += 4

        # ClientHello fields
        client_version = struct.unpack(">H", data[offset:offset+2])[0]
        offset += 2

        # Random (32 bytes)
        offset += 32

        # Session ID
        session_id_len = data[offset]
        offset += 1 + session_id_len

        # Cipher Suites
        cipher_suites_len = struct.unpack(">H", data[offset:offset+2])[0]
        offset += 2

        cipher_suites = []
        for i in range(0, cipher_suites_len, 2):
            cipher = struct.unpack(">H", data[offset+i:offset+i+2])[0]
            cipher_suites.append(cipher)
        offset += cipher_suites_len

        # Compression Methods
        compression_len = data[offset]
        offset += 1 + compression_len

        # Extensions
        extensions = []
        sni = None
        alpn_protocols = []
        supported_versions = []
        signature_algorithms = []

        if offset < len(data):
            extensions_len = struct.unpack(">H", data[offset:offset+2])[0]
            offset += 2

            ext_end = offset + extensions_len
            while offset < ext_end:
                ext_type = struct.unpack(">H", data[offset:offset+2])[0]
                ext_len = struct.unpack(">H", data[offset+2:offset+4])[0]
                ext_data = data[offset+4:offset+4+ext_len]

                extensions.append(ext_type)

                # Parse specific extensions
                if ext_type == EXT_SNI and ext_len > 0:
                    # SNI extension
                    try:
                        sni_list_len = struct.unpack(">H", ext_data[0:2])[0]
                        sni_type = ext_data[2]
                        sni_len = struct.unpack(">H", ext_data[3:5])[0]
                        sni = ext_data[5:5+sni_len].decode('utf-8')
                    except Exception:
                        pass

                elif ext_type == EXT_ALPN and ext_len > 0:
                    # ALPN extension
                    try:
                        alpn_list_len = struct.unpack(">H", ext_data[0:2])[0]
                        alpn_offset = 2
                        while alpn_offset < 2 + alpn_list_len:
                            proto_len = ext_data[alpn_offset]
                            proto = ext_data[alpn_offset+1:alpn_offset+1+proto_len].decode('utf-8')
                            alpn_protocols.append(proto)
                            alpn_offset += 1 + proto_len
                    except Exception:
                        pass

                elif ext_type == EXT_SUPPORTED_VERSIONS and ext_len > 0:
                    # Supported versions extension
                    try:
                        ver_list_len = ext_data[0]
                        for i in range(0, ver_list_len, 2):
                            ver = struct.unpack(">H", ext_data[1+i:3+i])[0]
                            supported_versions.append(ver)
                    except Exception:
                        pass

                elif ext_type == EXT_SIGNATURE_ALGORITHMS and ext_len > 0:
                    # Signature algorithms extension
                    try:
                        sig_list_len = struct.unpack(">H", ext_data[0:2])[0]
                        for i in range(0, sig_list_len, 2):
                            sig = struct.unpack(">H", ext_data[2+i:4+i])[0]
                            signature_algorithms.append(sig)
                    except Exception:
                        pass

                offset += 4 + ext_len

        return ClientHello(
            version=client_version,
            cipher_suites=cipher_suites,
            extensions=extensions,
            sni=sni,
            alpn_protocols=alpn_protocols,
            supported_versions=supported_versions,
            signature_algorithms=signature_algorithms
        )

    except Exception as e:
        print(f"Parse error: {e}", file=sys.stderr)
        return None


def extract_from_pcap(pcap_path: str) -> list[tuple[str, JA4Fingerprint]]:
    """
    Extract JA4 fingerprints from a pcap file.

    Returns list of (source_ip, fingerprint) tuples.
    """
    try:
        from scapy.all import rdpcap, TCP, IP
        from scapy.layers.tls.handshake import TLSClientHello
        from scapy.layers.tls.record import TLS
    except ImportError:
        print("Error: scapy is required. Install with: pip install scapy", file=sys.stderr)
        return []

    results = []
    packets = rdpcap(pcap_path)

    for pkt in packets:
        if pkt.haslayer(TLS) and pkt.haslayer(TLSClientHello):
            try:
                tls = pkt[TLS]
                ch = pkt[TLSClientHello]

                # Extract fields using scapy
                client_hello = ClientHello(
                    version=ch.version,
                    cipher_suites=list(ch.ciphers) if ch.ciphers else [],
                    extensions=[e.type for e in ch.ext] if ch.ext else [],
                    sni=None,
                    alpn_protocols=[],
                    supported_versions=[],
                    signature_algorithms=[]
                )

                # Parse extensions
                if ch.ext:
                    for ext in ch.ext:
                        if ext.type == EXT_SNI:
                            try:
                                client_hello.sni = ext.servernames[0].servername.decode()
                            except Exception:
                                pass
                        elif ext.type == EXT_ALPN:
                            try:
                                client_hello.alpn_protocols = [
                                    p.decode() for p in ext.protocols
                                ]
                            except Exception:
                                pass
                        elif ext.type == EXT_SUPPORTED_VERSIONS:
                            try:
                                client_hello.supported_versions = list(ext.versions)
                            except Exception:
                                pass
                        elif ext.type == EXT_SIGNATURE_ALGORITHMS:
                            try:
                                client_hello.signature_algorithms = list(ext.sig_algs)
                            except Exception:
                                pass

                ja4 = calculate_ja4(client_hello)
                source_ip = pkt[IP].src if pkt.haslayer(IP) else "unknown"
                results.append((source_ip, ja4))

            except Exception as e:
                print(f"Error processing packet: {e}", file=sys.stderr)

    return results


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python ja4_extractor.py <pcap_file>")
        print("       python ja4_extractor.py --live <interface>")
        sys.exit(1)

    if sys.argv[1] == "--live":
        if len(sys.argv) < 3:
            print("Error: interface required for live capture")
            sys.exit(1)
        print(f"Live capture on {sys.argv[2]} not implemented in starter code")
        print("Hint: Use scapy's sniff() function with a callback")
        sys.exit(0)

    pcap_path = sys.argv[1]
    print(f"Extracting JA4 fingerprints from: {pcap_path}")
    print("-" * 60)

    results = extract_from_pcap(pcap_path)

    for source_ip, ja4 in results:
        print(f"Source: {source_ip}")
        print(f"  JA4:   {ja4.full}")
        print(f"  JA4_a: {ja4.a}")
        print(f"  JA4_b: {ja4.b}")
        print(f"  JA4_c: {ja4.c}")
        print()

    print(f"Total fingerprints extracted: {len(results)}")


if __name__ == "__main__":
    main()
