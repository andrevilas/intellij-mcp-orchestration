#!/usr/bin/env python3
"""Helpers for securely loading secret bundles for local tooling.

This module provides a CLI that consolidates the logic required to source
secrets from a HashiCorp Vault deployment or from an encrypted SOPS bundle.
The command writes a JSON payload compatible with ``scripts/secrets-sync.sh``.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict

DEFAULT_SOPS_FILE = "config/secrets.enc.yaml"
DEFAULT_SOPS_BIN = "sops"


class SecretLoaderError(RuntimeError):
    """Base exception for loader failures."""


def _log(message: str) -> None:
    sys.stderr.write(f"[secure-reader] {message}\n")


def _load_from_sops() -> Dict[str, Any]:
    """Decrypt the configured SOPS bundle and return its payload."""

    sops_bin = os.environ.get("SOPS_BIN", DEFAULT_SOPS_BIN)
    sops_file = os.environ.get("SOPS_FILE", DEFAULT_SOPS_FILE)

    if shutil.which(sops_bin) is None:
        raise SecretLoaderError(
            f"SOPS binary '{sops_bin}' não encontrado. Instale-o ou defina SOPS_BIN."
        )

    bundle_path = Path(sops_file)
    if not bundle_path.is_file():
        raise SecretLoaderError(
            f"Bundle SOPS '{bundle_path}' não encontrado. Ajuste SOPS_FILE ou sincronize o repositório."
        )

    try:
        result = subprocess.run(
            [sops_bin, "--decrypt", "--output-type", "json", str(bundle_path)],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:  # pragma: no cover - defensive
        raise SecretLoaderError(
            "Falha ao executar sops para descriptografar o bundle."
        ) from exc

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise SecretLoaderError("Conteúdo JSON inválido retornado pelo sops.") from exc

    data = payload.get("secrets", payload)
    if not isinstance(data, dict):
        raise SecretLoaderError("O bundle SOPS não contém um objeto de segredos válido.")

    _log(f"Bundle SOPS carregado a partir de '{bundle_path}'.")
    return data


def _vault_request(
    addr: str,
    namespace: str | None,
    token: str | None,
    path: str,
    *,
    method: str = "GET",
    body: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    url = f"{addr.rstrip('/')}/v1/{path.lstrip('/')}"
    data: bytes | None = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("X-Vault-Token", token)
    if namespace:
        request.add_header("X-Vault-Namespace", namespace)

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        raise SecretLoaderError(
            f"Erro HTTP ao consultar Vault ({exc.code}): {detail or exc.reason}."
        ) from exc
    except urllib.error.URLError as exc:
        raise SecretLoaderError(f"Falha ao conectar no Vault: {exc.reason}.") from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise SecretLoaderError("Resposta inválida recebida do Vault (JSON esperado).") from exc


def _vault_login(addr: str, namespace: str | None) -> str:
    role_id = os.environ.get("VAULT_ROLE_ID")
    secret_id = os.environ.get("VAULT_SECRET_ID")
    if not role_id or not secret_id:
        raise SecretLoaderError(
            "Defina VAULT_TOKEN ou o par VAULT_ROLE_ID/VAULT_SECRET_ID para autenticar no Vault."
        )

    response = _vault_request(
        addr,
        namespace,
        None,
        "auth/approle/login",
        method="POST",
        body={"role_id": role_id, "secret_id": secret_id},
    )

    auth = response.get("auth") or {}
    token = auth.get("client_token")
    if not token or not isinstance(token, str):
        raise SecretLoaderError("Resposta inesperada do Vault ao efetuar login via AppRole.")

    _log("Autenticação AppRole no Vault concluída com sucesso.")
    return token


def _resolve_vault_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", payload)
    if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict):
        data = data["data"]
    if not isinstance(data, dict):
        raise SecretLoaderError("O segredo retornado pelo Vault não contém um objeto JSON.")
    return data


def _load_from_vault() -> Dict[str, Any]:
    addr = os.environ.get("VAULT_ADDR")
    secret_path = os.environ.get("VAULT_SECRET_PATH")
    namespace = os.environ.get("VAULT_NAMESPACE")

    if not addr or not secret_path:
        raise SecretLoaderError(
            "VAULT_ADDR e VAULT_SECRET_PATH precisam estar definidos para uso do Vault."
        )

    token = os.environ.get("VAULT_TOKEN")
    if not token:
        token = _vault_login(addr, namespace)

    payload = _vault_request(addr, namespace, token, secret_path)
    data = _resolve_vault_payload(payload)

    selected_key = os.environ.get("VAULT_SECRETS_KEY")
    if selected_key:
        for part in selected_key.split('.'):
            if isinstance(data, dict) and part in data:
                data = data[part]
            else:
                raise SecretLoaderError(
                    f"Chave '{selected_key}' não encontrada no segredo do Vault."
                )
        if not isinstance(data, dict):
            raise SecretLoaderError(
                "A chave especificada em VAULT_SECRETS_KEY não referencia um objeto JSON."
            )

    _log(f"Segredo carregado do Vault em '{secret_path}'.")
    return data


def _determine_provider(explicit: str | None) -> str:
    if explicit and explicit != "auto":
        return explicit

    if os.environ.get("VAULT_ADDR") and os.environ.get("VAULT_SECRET_PATH"):
        return "vault"

    return "sops"


def _write_output(payload: Dict[str, Any], *, output: Path | None, emit_stdout: bool) -> None:
    serialised = json.dumps({"secrets": payload}, indent=2, sort_keys=True)

    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(serialised, encoding="utf-8")
        os.chmod(output, 0o600)
        _log(f"Arquivo temporário escrito em '{output}'.")

    if emit_stdout:
        sys.stdout.write(serialised)
        if serialised and not serialised.endswith("\n"):
            sys.stdout.write("\n")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Carrega segredos a partir do Vault ou bundle SOPS e emite JSON seguro.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """
            Variáveis de ambiente suportadas:
              - VAULT_ADDR, VAULT_SECRET_PATH, VAULT_NAMESPACE
              - VAULT_TOKEN ou o par VAULT_ROLE_ID/VAULT_SECRET_ID
              - VAULT_SECRETS_KEY para selecionar um objeto dentro do segredo
              - SOPS_FILE, SOPS_BIN para controlar o bundle SOPS
            """
        ),
    )
    parser.add_argument(
        "--provider",
        choices=("auto", "vault", "sops"),
        default="auto",
        help="Seleção explícita do provedor de segredos. Padrão: auto",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Arquivo de saída para gravar o JSON resultante.",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Também imprimir o JSON no stdout (além de --output).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    provider = _determine_provider(args.provider)
    _log(f"Utilizando provedor '{provider}'.")

    try:
        if provider == "vault":
            secrets = _load_from_vault()
        elif provider == "sops":
            secrets = _load_from_sops()
        else:  # pragma: no cover - defensive guard
            raise SecretLoaderError(f"Provedor desconhecido: {provider}")
    except SecretLoaderError as exc:
        _log(str(exc))
        return 1

    if not isinstance(secrets, dict):  # pragma: no cover - defesa adicional
        _log("O provedor retornou um payload inesperado (dict esperado).")
        return 1

    emit_stdout = args.stdout or not args.output
    _write_output(secrets, output=args.output, emit_stdout=emit_stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
