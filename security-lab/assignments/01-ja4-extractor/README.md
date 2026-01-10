# Assignment 1: JA4 Fingerprint Extractor

**Due:** Week 2
**Points:** 100

## Objective

Build a tool that extracts JA4 TLS fingerprints from pcap files.

## Learning Goals

- Understand TLS ClientHello message structure
- Learn JA4 fingerprint calculation algorithm
- Practice parsing binary network protocols

## Requirements

### Input
- Path to a pcap file containing TLS handshakes

### Output
For each TLS ClientHello in the pcap:
```
Source: 192.168.1.100
  JA4:   t13d1516h2_8daaf6152771_e5627efa2ab1
  JA4_a: t13d1516h2
  JA4_b: 8daaf6152771
  JA4_c: e5627efa2ab1
```

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| JA4_a calculation | 30 | Correct protocol, version, SNI, counts, ALPN |
| JA4_b calculation | 25 | Correct cipher sorting and hashing |
| JA4_c calculation | 25 | Correct extension filtering, sorting, sig_algs |
| GREASE filtering | 10 | Properly excludes GREASE values |
| Code quality | 10 | Clean, documented, handles errors |

## Starter Code

See `starter.py` for a skeleton implementation with TODOs.

## Test Data

Test pcaps are provided in `/pcaps/test/`:
- `chrome-120.pcap` - Chrome browser traffic
- `firefox-120.pcap` - Firefox browser traffic
- `python-requests.pcap` - Python requests library
- `mixed.pcap` - Multiple clients for testing

## Expected Results

Compare your output against the reference implementation:
```bash
python /detection/ja4_extractor.py /pcaps/test/chrome-120.pcap
```

## Hints

1. TLS ClientHello is handshake type 0x01
2. GREASE values end in 0x0a0a pattern (see RFC 8701)
3. JA4 sorts ciphers and extensions to resist randomization
4. SNI (0x0000) and ALPN (0x0010) are excluded from extension hash

## Submission

Submit:
1. Your `ja4_extractor.py` implementation
2. Brief write-up explaining your approach (max 1 page)
3. Output from running against test pcaps
