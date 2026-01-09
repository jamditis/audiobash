# Zeek configuration for TLS Fingerprint Lab
# Enables JA4 fingerprint extraction from TLS traffic

# Load standard scripts
@load base/frameworks/logging
@load base/protocols/ssl
@load base/protocols/http

# Load JA4 package (install with: zkg install ja4)
# @load ja4

# Enable all JA4 fingerprint types
redef JA4::enable_ja4 = T;    # TLS client fingerprint
redef JA4::enable_ja4s = T;   # TLS server fingerprint
redef JA4::enable_ja4h = T;   # HTTP fingerprint
redef JA4::enable_raw = F;    # Set T for non-hashed output (debugging)

# Custom logging for lab analysis
module LabFingerprints;

export {
    # Create custom log for fingerprint analysis
    redef enum Log::ID += { LOG };

    type Info: record {
        ts: time &log;
        uid: string &log;
        orig_h: addr &log;
        orig_p: port &log;
        resp_h: addr &log;
        resp_p: port &log;
        ja4: string &log &optional;
        user_agent: string &log &optional;
        server_name: string &log &optional;
    };
}

event zeek_init()
{
    Log::create_stream(LabFingerprints::LOG,
        [$columns=Info, $path="lab_fingerprints"]);
}

# Log TLS fingerprints with associated HTTP User-Agent
event ssl_established(c: connection)
{
    local info: Info;
    info$ts = network_time();
    info$uid = c$uid;
    info$orig_h = c$id$orig_h;
    info$orig_p = c$id$orig_p;
    info$resp_h = c$id$resp_h;
    info$resp_p = c$id$resp_p;

    if ( c$ssl?$ja4 )
        info$ja4 = c$ssl$ja4;

    if ( c$ssl?$server_name )
        info$server_name = c$ssl$server_name;

    Log::write(LabFingerprints::LOG, info);
}

# Capture HTTP User-Agent for correlation
event http_header(c: connection, is_orig: bool, name: string, value: string)
{
    if ( is_orig && name == "USER-AGENT" )
    {
        # Store for later correlation with TLS fingerprint
        # In production, you'd correlate by connection UID
        print fmt("UA: %s -> %s", c$id$orig_h, value);
    }
}
