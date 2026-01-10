# Red Team Evasion Examples

These examples are for the **instructor** to use as progressively sophisticated evasion techniques.
Students attempt to detect each level in their assignments.

## Evasion Levels

| Level | Directory | Technique | Detection Difficulty |
|-------|-----------|-----------|---------------------|
| 0 | `level-0-baseline/` | Default Python requests | Trivial |
| 1 | `level-1-curl-cffi/` | curl_cffi impersonation | Easy |
| 2 | `level-2-tls-client/` | tls_client + H2 settings | Medium |
| 3 | `level-3-randomization/` | Extension randomization | Medium-Hard |
| 4 | `level-4-real-browser/` | Real browser automation | Hard |

## Usage

Each level directory contains:
- `client.py` - The evasion client implementation
- `README.md` - What technique is used and expected detection gaps
- `test.py` - Script to generate test traffic

## Running Examples

```bash
# Install dependencies
pip install -r requirements.txt

# Run level 0 (baseline - should be trivially detected)
python level-0-baseline/client.py

# Run level 1 (curl_cffi - harder to detect)
python level-1-curl-cffi/client.py

# Run level 2 (tls_client - even harder)
python level-2-tls-client/client.py
```

## Deployment Notes

When deploying for student exercises:

1. Run traffic through the lab's Zeek instance for capture
2. Have students analyze pcaps to extract fingerprints
3. Test their detection APIs against each level
4. Grade based on detection rate vs false positive rate

## Ethics Reminder

These techniques are provided **solely for defensive education**.
Using these techniques against production systems is prohibited.
