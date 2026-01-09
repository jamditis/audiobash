-- TLS Fingerprint Detection Lab - Database Schema
-- PostgreSQL 16+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- Core Tables
-- ============================================

-- Known fingerprints (browser/client baseline)
CREATE TABLE known_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ja4 VARCHAR(50) NOT NULL,
    ja4_a VARCHAR(15) NOT NULL,  -- First component (readable metadata)
    ja4_b VARCHAR(12) NOT NULL,  -- Cipher hash
    ja4_c VARCHAR(12) NOT NULL,  -- Extension hash

    -- Client identification
    application VARCHAR(100) NOT NULL,
    version VARCHAR(50),
    os VARCHAR(50),
    tls_library VARCHAR(100),

    -- Classification
    is_browser BOOLEAN DEFAULT FALSE,
    is_bot BOOLEAN DEFAULT FALSE,
    is_malicious BOOLEAN DEFAULT FALSE,
    confidence FLOAT DEFAULT 1.0,

    -- Metadata
    source VARCHAR(100),  -- Where this fingerprint came from
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(ja4)
);

-- Observed fingerprints (from live traffic)
CREATE TABLE observed_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ja4 VARCHAR(50) NOT NULL,
    ja4_a VARCHAR(15) NOT NULL,
    ja4_b VARCHAR(12) NOT NULL,
    ja4_c VARCHAR(12) NOT NULL,

    -- Connection metadata
    source_ip INET NOT NULL,
    source_port INTEGER,
    dest_ip INET,
    dest_port INTEGER DEFAULT 443,

    -- HTTP layer data
    user_agent TEXT,
    http2_fingerprint VARCHAR(200),  -- Akamai-style H2 fingerprint
    header_order TEXT[],

    -- Timing
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hit_count INTEGER DEFAULT 1,

    -- Classification (populated by detection system)
    matched_known_id UUID REFERENCES known_fingerprints(id),
    anomaly_score FLOAT DEFAULT 0.0,
    classification VARCHAR(50),  -- 'legitimate', 'suspicious', 'blocked'
    detection_reasons TEXT[]
);

-- Detection events (alerts/logs)
CREATE TABLE detection_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    observed_id UUID REFERENCES observed_fingerprints(id),

    event_type VARCHAR(50) NOT NULL,  -- 'mismatch', 'unknown', 'behavioral', 'blocked'
    severity VARCHAR(20) NOT NULL,     -- 'low', 'medium', 'high', 'critical'

    -- Detection details
    signals JSONB NOT NULL,  -- All signals that triggered detection
    score FLOAT NOT NULL,
    threshold FLOAT,

    -- Context
    request_path TEXT,
    request_method VARCHAR(10),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session tracking (for behavioral analysis)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_key VARCHAR(100) NOT NULL,  -- Hash of IP + JA4 + UA
    source_ip INET NOT NULL,
    ja4 VARCHAR(50),
    user_agent TEXT,

    -- Behavioral metrics
    request_count INTEGER DEFAULT 0,
    avg_request_interval_ms FLOAT,
    request_interval_variance FLOAT,
    unique_paths INTEGER DEFAULT 0,

    -- Timing
    first_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Classification
    is_automated BOOLEAN,
    automation_confidence FLOAT,

    UNIQUE(session_key)
);

-- Request log (for detailed behavioral analysis)
CREATE TABLE request_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id),

    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    request_path TEXT,
    request_method VARCHAR(10),
    response_code INTEGER,
    response_time_ms INTEGER,

    -- Inter-request timing
    time_since_last_ms INTEGER
);

-- ============================================
-- Indexes for performance
-- ============================================

CREATE INDEX idx_known_ja4 ON known_fingerprints(ja4);
CREATE INDEX idx_known_ja4_a ON known_fingerprints(ja4_a);
CREATE INDEX idx_known_application ON known_fingerprints(application);
CREATE INDEX idx_known_is_browser ON known_fingerprints(is_browser);

CREATE INDEX idx_observed_ja4 ON observed_fingerprints(ja4);
CREATE INDEX idx_observed_ja4_a ON observed_fingerprints(ja4_a);
CREATE INDEX idx_observed_source_ip ON observed_fingerprints(source_ip);
CREATE INDEX idx_observed_first_seen ON observed_fingerprints(first_seen);
CREATE INDEX idx_observed_anomaly ON observed_fingerprints(anomaly_score);

CREATE INDEX idx_events_type ON detection_events(event_type);
CREATE INDEX idx_events_severity ON detection_events(severity);
CREATE INDEX idx_events_created ON detection_events(created_at);

CREATE INDEX idx_sessions_key ON sessions(session_key);
CREATE INDEX idx_sessions_ip ON sessions(source_ip);

CREATE INDEX idx_requests_session ON request_log(session_id);
CREATE INDEX idx_requests_time ON request_log(request_time);

-- ============================================
-- Functions
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER known_fingerprints_updated
    BEFORE UPDATE ON known_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Parse JA4 into components
CREATE OR REPLACE FUNCTION parse_ja4(ja4_input VARCHAR)
RETURNS TABLE(ja4_a VARCHAR, ja4_b VARCHAR, ja4_c VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT
        split_part(ja4_input, '_', 1)::VARCHAR AS ja4_a,
        split_part(ja4_input, '_', 2)::VARCHAR AS ja4_b,
        split_part(ja4_input, '_', 3)::VARCHAR AS ja4_c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate anomaly score for observed fingerprint
CREATE OR REPLACE FUNCTION calculate_anomaly_score(
    p_ja4 VARCHAR,
    p_user_agent TEXT
) RETURNS FLOAT AS $$
DECLARE
    v_score FLOAT := 0.0;
    v_known_match known_fingerprints%ROWTYPE;
    v_expected_browser VARCHAR;
BEGIN
    -- Check if JA4 exists in known fingerprints
    SELECT * INTO v_known_match
    FROM known_fingerprints
    WHERE ja4 = p_ja4
    LIMIT 1;

    IF NOT FOUND THEN
        -- Unknown fingerprint adds 0.3 to score
        v_score := v_score + 0.3;
    ELSE
        -- Check for UA mismatch
        IF p_user_agent IS NOT NULL THEN
            v_expected_browser := v_known_match.application;

            -- Simple mismatch check
            IF v_expected_browser ILIKE '%chrome%' AND p_user_agent NOT ILIKE '%chrome%' THEN
                v_score := v_score + 0.5;
            ELSIF v_expected_browser ILIKE '%firefox%' AND p_user_agent NOT ILIKE '%firefox%' THEN
                v_score := v_score + 0.5;
            ELSIF v_expected_browser ILIKE '%python%' AND p_user_agent ILIKE '%chrome%' THEN
                v_score := v_score + 0.7;  -- Python claiming to be Chrome
            END IF;
        END IF;

        -- Known malicious fingerprint
        IF v_known_match.is_malicious THEN
            v_score := v_score + 0.8;
        END IF;
    END IF;

    RETURN LEAST(v_score, 1.0);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views
-- ============================================

-- High-risk observations
CREATE VIEW high_risk_observations AS
SELECT
    o.id,
    o.ja4,
    o.source_ip,
    o.user_agent,
    o.anomaly_score,
    o.classification,
    o.detection_reasons,
    o.first_seen,
    o.hit_count,
    k.application AS matched_application
FROM observed_fingerprints o
LEFT JOIN known_fingerprints k ON o.matched_known_id = k.id
WHERE o.anomaly_score > 0.5
ORDER BY o.anomaly_score DESC, o.first_seen DESC;

-- Fingerprint statistics
CREATE VIEW fingerprint_stats AS
SELECT
    ja4_a,
    COUNT(*) AS observation_count,
    COUNT(DISTINCT source_ip) AS unique_ips,
    AVG(anomaly_score) AS avg_anomaly_score,
    MIN(first_seen) AS first_observed,
    MAX(last_seen) AS last_observed
FROM observed_fingerprints
GROUP BY ja4_a
ORDER BY observation_count DESC;

-- Automated session candidates
CREATE VIEW automated_sessions AS
SELECT
    s.*,
    COUNT(r.id) AS total_requests,
    MIN(r.time_since_last_ms) AS min_interval,
    MAX(r.time_since_last_ms) AS max_interval
FROM sessions s
JOIN request_log r ON r.session_id = s.id
GROUP BY s.id
HAVING
    -- Very low variance suggests automation
    s.request_interval_variance < 100
    OR MIN(r.time_since_last_ms) < 50  -- Superhuman speed
    OR COUNT(r.id) > 100;  -- High volume

-- ============================================
-- Seed Data: Known Browser Fingerprints
-- ============================================

INSERT INTO known_fingerprints (ja4, ja4_a, ja4_b, ja4_c, application, version, os, is_browser, source) VALUES
-- Chrome variants (these are representative, actual fingerprints vary)
('t13d1517h2_8daaf6152771_02713d6af862', 't13d1517h2', '8daaf6152771', '02713d6af862', 'Chrome', '120+', 'Windows', TRUE, 'lab-baseline'),
('t13d1516h2_8daaf6152771_e5627efa2ab1', 't13d1516h2', '8daaf6152771', 'e5627efa2ab1', 'Chrome', '120+', 'macOS', TRUE, 'lab-baseline'),
('t13d1516h2_8daaf6152771_b0da82dd1658', 't13d1516h2', '8daaf6152771', 'b0da82dd1658', 'Chrome', '120+', 'Linux', TRUE, 'lab-baseline'),

-- Firefox variants
('t13d1514h2_a09f3c656075_9316e4d8a0b2', 't13d1514h2', 'a09f3c656075', '9316e4d8a0b2', 'Firefox', '120+', 'Windows', TRUE, 'lab-baseline'),
('t13d1514h2_a09f3c656075_7c8b2e5f1a3d', 't13d1514h2', 'a09f3c656075', '7c8b2e5f1a3d', 'Firefox', '120+', 'macOS', TRUE, 'lab-baseline'),

-- Safari
('t13d1512h2_5b2e9f8c7a1d_3e4f5a6b7c8d', 't13d1512h2', '5b2e9f8c7a1d', '3e4f5a6b7c8d', 'Safari', '17+', 'macOS', TRUE, 'lab-baseline'),

-- Python requests (default - easy to detect)
('t12d0909h1_3b5aa07d0a1c_cd85d2d7a4b8', 't12d0909h1', '3b5aa07d0a1c', 'cd85d2d7a4b8', 'Python-requests', '2.x', 'Any', FALSE, 'lab-baseline'),

-- curl (default)
('t12d0808h1_4c6bb18e1b2d_de96e3e8b5c9', 't12d0808h1', '4c6bb18e1b2d', 'de96e3e8b5c9', 'curl', '8.x', 'Any', FALSE, 'lab-baseline'),

-- Go net/http
('t13d1210h2_7d8cc29f2c3e_ef07f4f9c6da', 't13d1210h2', '7d8cc29f2c3e', 'ef07f4f9c6da', 'Go-http-client', '1.x', 'Any', FALSE, 'lab-baseline'),

-- Known malicious patterns (for detection training)
('t12d0505h1_1a2b3c4d5e6f_abcdef123456', 't12d0505h1', '1a2b3c4d5e6f', 'abcdef123456', 'Suspicious-Bot', 'Unknown', 'Unknown', FALSE, 'lab-malicious'),
('t10d0303h1_deadbeef1234_cafe12345678', 't10d0303h1', 'deadbeef1234', 'cafe12345678', 'Legacy-Scraper', 'Unknown', 'Unknown', FALSE, 'lab-malicious');

-- Mark malicious fingerprints
UPDATE known_fingerprints SET is_malicious = TRUE, is_bot = TRUE
WHERE source = 'lab-malicious';

-- ============================================
-- Sample queries for students
-- ============================================

-- Example: Find fingerprints claiming Chrome but not matching known Chrome JA4
-- SELECT o.* FROM observed_fingerprints o
-- WHERE o.user_agent ILIKE '%chrome%'
-- AND o.ja4_a NOT IN (
--     SELECT ja4_a FROM known_fingerprints WHERE application ILIKE '%chrome%'
-- );

-- Example: Find sessions with suspicious timing patterns
-- SELECT * FROM automated_sessions WHERE min_interval < 50;

-- Example: Get detection events in the last hour
-- SELECT * FROM detection_events
-- WHERE created_at > NOW() - INTERVAL '1 hour'
-- ORDER BY score DESC;
