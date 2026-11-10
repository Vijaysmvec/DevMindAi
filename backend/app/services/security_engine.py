import re
from typing import Any

PROMPT_RULES = [
    {
        "id": "PS-001",
        "title": "System Instruction Override Attempt",
        "severity": "critical",
        "weight": 55,
        "pattern": re.compile(
            r"(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+system\s+prompt|you\s+are\s+now\s+unrestricted|developer\s+mode\s+enabled)",
            re.IGNORECASE,
        ),
        "remediation": "Strip system-override directives and isolate untrusted user prompt segments.",
    },
    {
        "id": "PS-002",
        "title": "Credential / Secret Exfiltration Probe",
        "severity": "high",
        "weight": 45,
        "pattern": re.compile(
            r"(print\s+(your\s+)?(api[_\s]?key|secret|env|environment\s+variables)|dump\s+\.env|reveal\s+system\s+prompt)",
            re.IGNORECASE,
        ),
        "remediation": "Enforce output secret redaction and reject environment introspection queries.",
    },
    {
        "id": "PS-003",
        "title": "Command / Shell Injection Payload",
        "severity": "high",
        "weight": 40,
        "pattern": re.compile(r"(;\s*rm\s+-rf|&&\s*curl\s+http|\$\(\s*wget|`cat\s+/etc/passwd`)", re.IGNORECASE),
        "remediation": "Never interpolate model output into shell execution contexts.",
    },
    {
        "id": "PS-004",
        "title": "Hardcoded Inline Token or Key Leak",
        "severity": "medium",
        "weight": 30,
        "pattern": re.compile(r"(AIza[0-9A-Za-z\-_]{20,}|AQ\.[0-9A-Za-z\-_]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})"),
        "remediation": "Redact sensitive credentials before sending prompts to external LLM providers.",
    },
]

CODE_SECURITY_RULES = [
    {
        "id": "CWE-798",
        "title": "Potential Hardcoded Credential / Secret",
        "severity": "critical",
        "pattern": re.compile(r"""(?:api_key|secret_key|password|access_token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]""", re.IGNORECASE),
        "advice": "Move secrets into environment variables or a managed secret vault.",
    },
    {
        "id": "CWE-89",
        "title": "Raw SQL String Interpolation",
        "severity": "high",
        "pattern": re.compile(
            r"""(?:f['"][^'"]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^'"]*\{|\b(?:SELECT|INSERT|UPDATE|DELETE)\b.*?(?:\+\s*[a-zA-Z_]|%\s*[a-zA-Z_(]|\.format\s*\())""",
            re.IGNORECASE,
        ),
        "advice": "Use parameterized SQL queries or ORM bound parameters.",
    },
    {
        "id": "CWE-78",
        "title": "Dynamic Code / Shell Execution Sink",
        "severity": "high",
        "pattern": re.compile(r"""\b(?:eval\s*\(|exec\s*\(|subprocess\.(?:Popen|run|call)\([^)]*shell\s*=\s*True)"""),
        "advice": "Replace dynamic eval/shell=True with strict argument arrays or safe parsers.",
    },
    {
        "id": "CWE-79",
        "title": "Unescaped DOM HTML Injection Surface",
        "severity": "medium",
        "pattern": re.compile(r"""(?:dangerouslySetInnerHTML|\.innerHTML\s*=)"""),
        "advice": "Sanitize untrusted markup with DOMPurify or use safe text bindings.",
    },
]


def scan_prompt_shield(prompt: str) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    risk = 0.0
    sanitized = prompt

    for rule in PROMPT_RULES:
        match = rule["pattern"].search(prompt)
        if match:
            risk += rule["weight"]
            findings.append(
                {
                    "rule_id": rule["id"],
                    "title": rule["title"],
                    "severity": rule["severity"],
                    "matched": match.group(0)[:80],
                    "remediation": rule["remediation"],
                }
            )
            sanitized = rule["pattern"].sub("[REDACTED_BY_PROMPTSHIELD]", sanitized)

    risk = min(100.0, round(risk, 1))
    if risk >= 55:
        verdict = "BLOCKED"
    elif risk >= 25:
        verdict = "ELEVATED"
    else:
        verdict = "SAFE"

    return {
        "risk_score": risk,
        "verdict": verdict,
        "findings": findings,
        "sanitized_prompt": sanitized,
    }


def audit_repository_files(files: list[dict[str, Any]]) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    for f in files:
        lines = f["content"].splitlines()
        for line_idx, line in enumerate(lines, start=1):
            for rule in CODE_SECURITY_RULES:
                if rule["pattern"].search(line):
                    findings.append(
                        {
                            "rule_id": rule["id"],
                            "title": rule["title"],
                            "severity": rule["severity"],
                            "file_path": f["path"],
                            "line": line_idx,
                            "snippet": line.strip()[:140],
                            "advice": rule["advice"],
                        }
                    )

    severity_weights = {"critical": 28, "high": 16, "medium": 8, "low": 3}
    risk_score = min(100.0, float(sum(severity_weights.get(item["severity"], 5) for item in findings)))
    verdict = "SAFE" if risk_score == 0 else ("ELEVATED" if risk_score < 50 else "CRITICAL")

    return {
        "risk_score": risk_score,
        "security_posture_score": max(0.0, round(100.0 - risk_score, 1)),
        "verdict": verdict,
        "finding_count": len(findings),
        "findings": findings[:50],
    }
