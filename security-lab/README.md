# TLS Fingerprint Detection Lab

A hands-on security curriculum for teaching students to detect TLS fingerprint evasion techniques.

## Course Overview

**Format:** Red Team vs Blue Team
**Duration:** 14 weeks
**Prerequisites:** Networking fundamentals, Python programming, basic cryptography

### Learning Objectives

By the end of this course, students will be able to:

1. Extract and analyze JA4 TLS fingerprints from network traffic
2. Build detection systems that identify spoofed/impersonated clients
3. Correlate multiple signal layers (TLS, HTTP/2, TCP, behavioral)
4. Understand the arms race between evasion and detection

### Course Structure

| Role | Description |
|------|-------------|
| **Red Team (Instructor)** | Deploys progressively sophisticated evasion techniques |
| **Blue Team (Students)** | Build detection systems to catch the evasion attempts |

## Quick Start

```bash
# Start the lab environment
cd security-lab
docker-compose up -d

# Verify services
docker-compose ps

# Access services
# - Traffic capture: http://localhost:8080
# - Detection API: http://localhost:5000
# - Database: localhost:5432
```

## Directory Structure

```
security-lab/
├── README.md                    # This file
├── docker-compose.yml           # Lab environment
├── assignments/                 # Student assignments
│   ├── 01-ja4-extractor/       # Parse pcaps, compute JA4
│   ├── 02-fingerprint-db/      # Build fingerprint database
│   ├── 03-anomaly-detection/   # UA/fingerprint mismatch detection
│   ├── 04-behavioral-analysis/ # Timing and sequence analysis
│   └── 05-integrated-system/   # Combined detection scoring
├── red-team/                    # Instructor evasion examples
│   ├── level-0-baseline/       # Default Python requests
│   ├── level-1-curl-cffi/      # Basic impersonation
│   ├── level-2-tls-client/     # Custom TLS + H2 settings
│   ├── level-3-randomization/  # Extension randomization
│   └── level-4-real-browser/   # Playwright automation
├── detection/                   # Reference detection implementations
│   ├── ja4_extractor.py        # JA4 fingerprint calculator
│   ├── fingerprint_db.py       # Database operations
│   └── detection_api.py        # REST API for scoring
├── database/                    # Schema and seed data
│   ├── schema.sql              # PostgreSQL schema
│   └── known_fingerprints.csv  # Known browser fingerprints
├── zeek/                        # Traffic capture config
│   └── local.zeek              # JA4 extraction config
└── grading/                     # Evaluation tools
    └── test_harness.py         # Automated grading tests
```

## Evasion Levels (Red Team)

| Level | Technique | Expected Detection Rate |
|-------|-----------|------------------------|
| 0 | Default Python `requests` | 100% (trivial) |
| 1 | `curl_cffi` Chrome impersonation | 85-95% |
| 2 | `tls_client` + custom HTTP/2 | 60-80% |
| 3 | Extension randomization | 40-60% |
| 4 | Real browser (Playwright) | 20-40% |

## Student Assignments

### Assignment 1: JA4 Fingerprint Extractor (Weeks 1-2)
Build a tool that extracts JA4 fingerprints from pcap files.

**Deliverables:**
- Parse TLS ClientHello messages
- Calculate all three JA4 components (a, b, c)
- Handle GREASE value filtering
- Output fingerprints in standard format

### Assignment 2: Fingerprint Database (Weeks 3-4)
Create a database system for storing and querying fingerprints.

**Deliverables:**
- PostgreSQL schema for fingerprints
- CRUD operations for fingerprint records
- Query by exact match and partial match (JA4_a, JA4_ac)
- Track first_seen, last_seen, hit_count

### Assignment 3: Anomaly Detection (Weeks 5-7)
Detect mismatches between claimed identity and fingerprint.

**Deliverables:**
- Parse User-Agent strings
- Cross-reference with JA4 fingerprint database
- Flag inconsistencies (e.g., "Chrome UA + Python JA4")
- Calculate confidence scores

### Assignment 4: Behavioral Analysis (Weeks 8-10)
Analyze request patterns to detect automation.

**Deliverables:**
- Request timing analysis (inter-request delays)
- Session behavior modeling
- Detect superhuman speeds and regularity
- Statistical variance analysis

### Assignment 5: Integrated Detection System (Weeks 11-14)
Combine all signals into a unified scoring API.

**Deliverables:**
- REST API accepting connection metadata
- Multi-signal scoring (TLS + HTTP + behavioral)
- Configurable thresholds and weights
- Real-time detection dashboard

## Grading Rubrics

### Technical Implementation (60%)
- Correctness of fingerprint calculation
- Database query efficiency
- API response times
- Code quality and documentation

### Detection Effectiveness (30%)
- True positive rate against red team
- False positive rate against legitimate traffic
- Handling of edge cases

### Innovation (10%)
- Novel detection techniques
- Multi-signal correlation creativity
- Performance optimizations

## Resources

### JA4 Specification
- [FoxIO JA4+ GitHub](https://github.com/FoxIO-LLC/ja4)
- [JA4 Technical Details](https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md)
- [JA4+ Database](https://ja4db.com/)

### Detection Research
- [Cloudflare JA4 Signals](https://blog.cloudflare.com/ja4-signals/)
- [HTTP/2 Fingerprinting](https://lwthiker.com/networks/2022/06/17/http2-fingerprinting.html)

### Evasion Techniques (for understanding, not malicious use)
- [curl_cffi Documentation](https://github.com/lexiforest/curl_cffi)
- [TLS Client Library](https://github.com/FlorianREGAZ/Python-Tls-Client)

## Ethics Statement

This lab is designed for **defensive security education**. Students learn evasion techniques solely to build better detection systems. All techniques are practiced in isolated lab environments against instructor-controlled targets only.

**Academic Integrity:** Using these techniques against production systems without authorization is prohibited and may violate computer fraud laws.
