#!/usr/bin/env python3
"""Validate OPS security controls for pipelines and secret handling."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]


def _git_ls_files() -> List[str]:
    """Return tracked files relative to repo root."""
    result = subprocess.run(
        ["git", "ls-files"],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _check_tracked_secrets(tracked: Iterable[str]) -> Tuple[bool, List[dict]]:
    """Ensure no plaintext secrets are versioned."""
    findings: List[dict] = []

    def is_allowed_env(path: str) -> bool:
        lower = path.lower()
        if not lower.split("/")[-1].startswith(".env"):
            return True
        return lower.endswith((".example", ".sample", ".template"))

    sensitive_patterns: List[Tuple[str, re.Pattern[str]]] = [
        ("plaintext env", re.compile(r"(^|/)\.env(?:\.[^.]+)?$", re.IGNORECASE)),
        ("unencrypted secrets json", re.compile(r"(^|/)(?:secrets?|secret-store)\.json$", re.IGNORECASE)),
        ("private key", re.compile(r"\.(?:pem|pfx|p12|pkcs12|pkcs8|key)$", re.IGNORECASE)),
        ("ssh private key", re.compile(r"(^|/)id_(?:rsa|dsa|ecdsa|ed25519)$", re.IGNORECASE)),
    ]

    allowlist = {
        "config/secrets.enc.yaml",
    }

    for path in tracked:
        if path in allowlist:
            continue

        lower = path.lower()
        if lower.split("/")[-1].startswith(".env") and is_allowed_env(path):
            continue

        matched = False
        for reason, pattern in sensitive_patterns:
            if pattern.search(path):
                findings.append({"path": path, "reason": reason})
                matched = True
                break
        if matched:
            continue

    return (len(findings) == 0, findings)


def _scan_workflow_permissions(workflow_path: Path) -> List[Tuple[int, str]]:
    """Return offending lines that elevate workflow permissions."""
    violations: List[Tuple[int, str]] = []
    lines = workflow_path.read_text(encoding="utf-8").splitlines()

    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if "permissions:" not in line:
            idx += 1
            continue

        indent = len(line) - len(line.lstrip())
        idx += 1
        while idx < len(lines):
            current_line = lines[idx]
            stripped = current_line.strip()
            current_indent = len(current_line) - len(current_line.lstrip())

            if stripped and current_indent <= indent:
                break
            if not stripped or stripped.startswith("#"):
                idx += 1
                continue

            if ":" in stripped:
                _, value = stripped.split(":", 1)
                value = value.split("#", 1)[0].strip()
                if "write" in value.split():
                    violations.append((idx + 1, stripped))
            idx += 1

    return violations


def _check_workflows() -> Tuple[bool, List[dict]]:
    """Validate GitHub workflow permissions remain least-privilege."""
    workflow_dir = REPO_ROOT / ".github" / "workflows"
    violations: List[dict] = []

    for workflow in sorted(workflow_dir.glob("*.yml")):
        offenders = _scan_workflow_permissions(workflow)
        if offenders:
            for line_no, content in offenders:
                violations.append(
                    {
                        "workflow": workflow.relative_to(REPO_ROOT).as_posix(),
                        "line": line_no,
                        "content": content,
                    }
                )

    return (len(violations) == 0, violations)


def _check_runbook_sections() -> Tuple[bool, List[str]]:
    """Validate that OPS runbooks contain the expected sections."""

    runbook_dir = REPO_ROOT / "docs" / "ops" / "runbooks"
    requirements = {
        runbook_dir / "secret-management.md": [
            "## Rotação programada",
            "## Rotação emergencial",
            "## Validação pós-rotação",
            "## Auditoria contínua",
        ],
        runbook_dir / "secrets-incident-playbook.md": [
            "## Fluxo tático (0–60 min)",
            "## Rotação emergencial",
            "## Auditoria pós-incidente",
            "## Acesso mínimo",
            "## Resposta a incidentes",
        ],
        runbook_dir / "auditoria-operacional.md": [
            "## Checklist OPS-302",
            "## Rotina semanal",
            "## Auditoria sob demanda",
            "## Indicadores de conformidade",
        ],
    }

    missing: List[str] = []
    for path, sections in requirements.items():
        if not path.exists():
            missing.append(f"{path.relative_to(REPO_ROOT)} ausente")
            continue

        content = path.read_text(encoding="utf-8")
        for section in sections:
            if section not in content:
                missing.append(
                    f"{path.relative_to(REPO_ROOT)} sem seção {section}"
                )

    return (len(missing) == 0, missing)


def _check_evidence() -> Tuple[bool, List[str]]:
    """Ensure OPS evidence artifacts and checklists are present and filled."""

    base_301 = REPO_ROOT / "docs" / "evidence" / "TASK-OPS-301"
    base_302 = REPO_ROOT / "docs" / "evidence" / "TASK-OPS-302"

    requirements = [
        base_301 / "README.md",
        base_301 / "ci-updates.md",
        base_302 / "README.md",
        base_302 / "ops-controls-report.json",
        base_302 / "runbooks-activation.md",
    ]

    missing = [
        str(path.relative_to(REPO_ROOT))
        for path in requirements
        if not path.exists()
    ]

    checklist_expectations = {
        "Runbooks finais": re.compile(
            r"- \[x\] Runbooks finais publicados .*",
            re.IGNORECASE,
        ),
        "Pipelines com gates": re.compile(
            r"- \[x\] Pipelines atualizadas com secret scanning e ops_compliance",
            re.IGNORECASE,
        ),
        "Evidências registradas": re.compile(
            r"- \[x\] Evidências registradas em /docs/evidence/TASK-OPS-302",
            re.IGNORECASE,
        ),
    }

    readme_path = base_302 / "README.md"
    if readme_path.exists():
        readme_content = readme_path.read_text(encoding="utf-8")
        for label, pattern in checklist_expectations.items():
            if not pattern.search(readme_content):
                missing.append(
                    f"Checklist '{label}' não marcado em docs/evidence/TASK-OPS-302/README.md"
                )

        readme_expectations = {
            "Seção de execuções registradas": re.compile(
                r"## Execuções registradas", re.IGNORECASE
            ),
            "Link para ops-controls-report": re.compile(
                r"\[ops-controls-report\.json\]", re.IGNORECASE
            ),
        }

        for label, pattern in readme_expectations.items():
            if not pattern.search(readme_content):
                missing.append(
                    f"docs/evidence/TASK-OPS-302/README.md sem {label.lower()}"
                )

    activation_path = base_302 / "runbooks-activation.md"
    if activation_path.exists():
        activation_content = activation_path.read_text(encoding="utf-8")
        activation_expectations = {
            "Seção de links de execução": re.compile(
                r"## Links de execução", re.IGNORECASE
            ),
            "Referência ao ops_controls": re.compile(
                r"ops_controls", re.IGNORECASE
            ),
        }

        for label, pattern in activation_expectations.items():
            if not pattern.search(activation_content):
                missing.append(
                    f"docs/evidence/TASK-OPS-302/runbooks-activation.md sem {label.lower()}"
                )

    return (len(missing) == 0, missing)


def build_report() -> Tuple[dict, bool]:
    tracked = _git_ls_files()
    no_plaintext, findings = _check_tracked_secrets(tracked)
    workflows_ok, workflow_findings = _check_workflows()
    runbook_ok, missing_sections = _check_runbook_sections()
    evidence_ok, missing_evidence = _check_evidence()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "pass",
        "checks": [],
    }

    def add_check(name: str, passed: bool, details) -> None:
        entry = {"name": name, "status": "pass" if passed else "fail"}
        if details:
            entry["details"] = details
        if not passed:
            report["status"] = "fail"
        report["checks"].append(entry)

    add_check(
        "Plaintext secrets not committed",
        no_plaintext,
        findings,
    )
    add_check(
        "Workflow permissions limited to read",
        workflows_ok,
        workflow_findings,
    )
    add_check(
        "OPS runbooks atualizados",
        runbook_ok,
        missing_sections,
    )
    add_check(
        "OPS evidence assets present",
        evidence_ok,
        missing_evidence,
    )

    return report, report["status"] == "pass"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Write JSON report to the given path.",
    )
    args = parser.parse_args(argv)

    report, ok = build_report()

    for check in report["checks"]:
        prefix = "[PASS]" if check["status"] == "pass" else "[FAIL]"
        print(f"{prefix} {check['name']}")
        if check.get("details") and check["status"] == "fail":
            if isinstance(check["details"], list):
                for item in check["details"]:
                    print(f"  - {item}")
            else:
                print(f"  - {check['details']}")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if not ok:
        print("OPS controls verification failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
