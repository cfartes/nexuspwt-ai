#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

# Reutiliza Docker e Traefik existentes; não altera outros projetos.
repo_url=https://github.com/cfartes/nexuspwt-ai.git
install_dir="${PTW_INSTALL_DIR:-/opt/nexus-ptw}"
for executable in git python3 docker; do
    command -v "$executable" >/dev/null || { printf 'Dependência ausente: %s\n' "$executable" >&2; exit 1; }
done
docker compose version >/dev/null
docker info >/dev/null
[[ "$install_dir" == /* && "$install_dir" != / && ! -L "$install_dir" ]] || { printf 'PTW_INSTALL_DIR inválido.\n' >&2; exit 1; }
if [[ -d "$install_dir/.git" ]]; then
    remote="$(git -C "$install_dir" remote get-url origin)"
    [[ "$remote" == "$repo_url" || "$remote" == "${repo_url%.git}" ]] || { printf 'Destino pertence a outro repositório.\n' >&2; exit 1; }
    [[ -z "$(git -C "$install_dir" status --porcelain)" ]] || { printf 'Checkout possui alterações; preserve-as antes de continuar.\n' >&2; exit 1; }
    [[ "$(git -C "$install_dir" branch --show-current)" == main ]] || { printf 'Use a branch main.\n' >&2; exit 1; }
    git -C "$install_dir" pull --ff-only origin main
else
    [[ ! -e "$install_dir" ]] || { printf 'Destino já existe sem Git.\n' >&2; exit 1; }
    git clone --branch main "$repo_url" "$install_dir"
fi
exec python3 "$install_dir/scripts/deploy_vps.py"
