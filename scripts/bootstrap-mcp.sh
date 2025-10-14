
#!/usr/bin/env bash
set -euo pipefail

MCP_HOME="${HOME}/.mcp"
BIN_DIR="${HOME}/.local/bin"
ENV_FILE="${MCP_HOME}/.env"
LOG_DIR="${MCP_HOME}/logs"
NODE_MIN="18"
NEED_DOCKER=0

info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()   { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }

command_exists() { command -v "$1" >/dev/null 2>&1; }
require_dir() { mkdir -p "$1"; }
append_unique_line() {
  local line="$1" file="$2"
  grep -qxF "$line" "$file" 2>/dev/null || echo "$line" >> "$file"
}

ensure_local_bin_on_path() {
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
    export PATH="$HOME/.local/bin:$PATH";;
  esac
  hash -r || true

  local SHELL_NAME RC_FILE
  SHELL_NAME="$(basename "${SHELL:-bash}")"
  [ "$SHELL_NAME" = "zsh" ] && RC_FILE="$HOME/.zshrc" || RC_FILE="$HOME/.bashrc"
  [ -f "$RC_FILE" ] || touch "$RC_FILE"
  if ! grep -qE '(^|\\s)export PATH=.*/\\.local/bin' "$RC_FILE"; then
    {
      echo ''
      echo '# Add ~/.local/bin to PATH for user-installed tools'
      echo 'export PATH="$HOME/.local/bin:$PATH"'
    } >> "$RC_FILE"
  fi
  if [ -t 1 ]; then . "$RC_FILE" || true; fi
}

ensure_python_pip() {
  info "Validando python3 + pip…"
  if ! command_exists python3; then
    warn "python3 ausente — instalando (APT)…"
    if command_exists apt; then
      sudo apt update -y && sudo apt install -y python3 python3-venv
    else
      err "Sem apt. Instale python3 manualmente."; exit 1
    fi
  fi

  if python3 -m pip --version >/dev/null 2>&1; then ok "pip ok"; return 0; fi

  if command_exists apt; then
    warn "Instalando python3-pip via APT…"
    sudo apt update -y || true
    sudo apt install -y python3-pip python3-venv || true
    python3 -m pip --version >/dev/null 2>&1 && { ok "pip via APT"; return 0; }
  fi

  warn "Tentando ensurepip…"
  if python3 -m ensurepip --upgrade >/dev/null 2>&1; then
    python3 -m pip --version >/dev/null 2>&1 && { ok "pip via ensurepip"; return 0; }
  fi

  warn "Fallback get-pip.py…"
  require_dir "${MCP_HOME}"
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "${MCP_HOME}/get-pip.py"
  python3 "${MCP_HOME}/get-pip.py" --user
  python3 -m pip --version >/dev/null 2>&1 || { err "Falha ao provisionar pip"; exit 1; }
  export PATH="$HOME/.local/bin:$PATH"
  ok "pip via get-pip.py"
}

preflight() {
  info "Preflight…"
  require_dir "$MCP_HOME" "$BIN_DIR" "$LOG_DIR"
  for dep in jq curl; do
    command_exists "$dep" || {
      warn "Instalando ${dep}…"; sudo apt update -y && sudo apt install -y "$dep"
    }
  done
  ensure_python_pip

  if ! command_exists pipx; then
    info "Instalando pipx…"
    python3 -m pip install --user pipx
    python3 -m pipx ensurepath || true
    export PATH="${HOME}/.local/bin:${PATH}"
  fi

  if ! command_exists node || ! command_exists npm; then
    warn "Instalando node/npm (APT)…"
    sudo apt update -y && sudo apt install -y nodejs npm || true
  fi
  if command_exists node; then
    major="$(node -v | sed 's/v\\([0-9]\\+\\).*/\\1/')"
    [ "${major:-0}" -lt "$NODE_MIN" ] && warn "Node $(node -v) < $NODE_MIN"
  fi

  if [ "$NEED_DOCKER" -eq 1 ]; then
    command_exists docker || { sudo apt update -y && sudo apt install -y docker.io; sudo usermod -aG docker "$USER" || true; }
  fi
  ok "Preflight ok"
}

ensure_env() {
  info "Configurando ${ENV_FILE}"
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  declare -A VARS=(
    [GEMINI_API_KEY]="Chave Google Gemini"
    [OPENAI_API_KEY]="Chave OpenAI/Codex"
    [ANTHROPIC_API_KEY]="Chave Anthropic (opcional)"
    [ZHIPU_API_KEY]="Chave Zhipu GLM‑4.6"
  )
  for key in "${!VARS[@]}"; do
    if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      read -r -p "👉 ${VARS[$key]}: " value || true
      [ -n "${value:-}" ] && append_unique_line "${key}=${value}" "$ENV_FILE"
    fi
  done
  ok "Env salvo (600)"
}

install_lightweight_sdks() {
  info "Instalando utilitários via pipx…"
  pipx list 2>/dev/null | grep -qi fastmcp || pipx install fastmcp >/dev/null 2>&1 || true
  pipx list 2>/dev/null | grep -qi modelcontext || python3 -m pipx install modelcontext >/dev/null 2>&1 || true
  ok "SDKs levinhos ok"
}

write_wrapper() {
  local name="$1" body="$2" path="${BIN_DIR}/${name}"
  printf '%s\n' "$body" > "$path"; chmod +x "$path"; echo "[Wrapper] ${path}"
}

generate_wrappers() {
  info "Gerando wrappers em ${BIN_DIR}…"

  read -r -d '' ENV_EXPORT <<'EOS'
# Carrega ~/.mcp/.env
if [ -f "$HOME/.mcp/.env" ]; then
  while IFS= read -r line; do
    case "$line" in ""|\#*) continue ;; *=*) export "$line" ;; esac
  done < "$HOME/.mcp/.env"
fi
EOS

  write_wrapper "gemini-mcp" "#!/usr/bin/env bash
set -euo pipefail
${ENV_EXPORT}
[ -z \"${GEMINI_API_KEY:-}\" ] && { echo '[ERROR] Configure GEMINI_API_KEY em ~/.mcp/.env'; exit 1; }
if command -v fastmcp >/dev/null 2>&1; then
  exec fastmcp --listen-stdio --provider gemini --api-key \"${GEMINI_API_KEY}\"
else
  echo '[ERROR] fastmcp ausente. Instale um servidor MCP p/ Gemini.'; exit 2
fi
"

  write_wrapper "codex-mcp" "#!/usr/bin/env bash
set -euo pipefail
${ENV_EXPORT}
[ -z \"${OPENAI_API_KEY:-}\" ] && { echo '[ERROR] Configure OPENAI_API_KEY em ~/.mcp/.env'; exit 1; }
if command -v codex >/dev/null 2>&1; then
  exec codex mcp serve --stdio
elif command -v openai-mcp-server >/dev/null 2>&1; then
  exec openai-mcp-server --stdio
else
  echo '[ERROR] MCP server p/ OpenAI/Codex não encontrado.'; exit 2
fi
"

  write_wrapper "glm46-mcp" "#!/usr/bin/env bash
set -euo pipefail
${ENV_EXPORT}
[ -z \"${ZHIPU_API_KEY:-}\" ] && { echo '[ERROR] Configure ZHIPU_API_KEY em ~/.mcp/.env'; exit 1; }
# Procura um servidor MCP local para GLM-4.6 (placeholder)
if command -v glm46-mcp-server >/dev/null 2>&1; then
  exec glm46-mcp-server --stdio --api-key \"${ZHIPU_API_KEY}\"
elif command -v zhipu-mcp-server >/dev/null 2>&1; then
  exec zhipu-mcp-server --stdio --api-key \"${ZHIPU_API_KEY}\"
else
  echo '[ERROR] Nenhum servidor MCP para GLM-4.6 encontrado.'
  echo '        Forneça um server stdio/http (wrapper Node/Python) que chame a API GLM-4.6 e atualize este wrapper.'
  exit 2
fi
"

  write_wrapper "claude-mcp" "#!/usr/bin/env bash
set -euo pipefail
cat <<'MSG'
[CLAUDE↔INTELLIJ]
- IntelliJ → Settings → Tools → MCP Server → Enable.
- Claude Desktop → Settings → MCP → Add local server (IntelliJ MCP).
- IntelliJ → AI Assistant → MCP → também consome Gemini/Codex/GLM‑4.6.
MSG
tail -f /dev/null
"
  ok "Wrappers prontos."
}

smoke_tests() {
  echo "[Smoke] Testando chamadas…"
  ~/.local/bin/gemini-mcp --help >/dev/null 2>&1 || echo "[Warn] gemini-mcp ainda depende do fastmcp real."
  ~/.local/bin/codex-mcp --help >/dev/null 2>&1 || echo "[Warn] codex-mcp requer CLI do Codex/OpenAI MCP."
  ~/.local/bin/glm46-mcp --help >/dev/null 2>&1 || echo "[Warn] glm46-mcp requer server MCP p/ GLM‑4.6."
  echo "[Smoke] OK (invocação)"
}

post_guidance() {
  cat <<EOF

===============================================================================
NEXT STEPS – IntelliJ (Ultimate)
===============================================================================
1) Settings → Tools → AI Assistant → MCP → Add → **Command**
   - ~/.local/bin/gemini-mcp
   - ~/.local/bin/codex-mcp
   - ~/.local/bin/glm46-mcp
   - ~/.local/bin/claude-mcp
2) (Opcional) IDE como MCP Server: Settings → Tools → MCP Server → Enable.
3) Defina políticas de roteamento (config/ai-assistant-mcp.json) e limites de custo.
4) Rode o ciclo: Análise → Planejamento → Execução+Testes → Documentação.
===============================================================================
EOF
}

main() {
  ensure_local_bin_on_path
  preflight
  ensure_env
  install_lightweight_sdks
  generate_wrappers
  smoke_tests
  post_guidance
  ok "Bootstrap MCP concluído."
}

main "$@"
