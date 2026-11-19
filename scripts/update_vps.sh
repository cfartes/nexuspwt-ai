#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

install_dir="${PTW_INSTALL_DIR:-/opt/nexus-ptw}"
for executable in git python3 docker; do
    command -v "$executable" >/dev/null || { printf 'Dependência ausente: %s\n' "$executable" >&2; exit 1; }
done
[[ "$install_dir" == /* && "$install_dir" != / && ! -L "$install_dir" ]] || { printf 'PTW_INSTALL_DIR inválido.\n' >&2; exit 1; }
[[ -d "$install_dir/.git" && -f "$install_dir/deploy/.env.production" ]] || { printf 'Instalação existente não encontrada. Atualização cancelada.\n' >&2; exit 1; }
remote="$(git -C "$install_dir" remote get-url origin)"
[[ "$remote" == https://github.com/cfartes/nexuspwt-ai.git || "$remote" == https://github.com/cfartes/nexuspwt-ai ]] || { printf 'Destino pertence a outro repositório.\n' >&2; exit 1; }
[[ -z "$(git -C "$install_dir" status --porcelain)" ]] || { printf 'Checkout possui alterações; preserve-as antes de continuar.\n' >&2; exit 1; }
[[ "$(git -C "$install_dir" branch --show-current)" == main ]] || { printf 'Use a branch main.\n' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null
git -C "$install_dir" pull --ff-only origin main
exec python3 "$install_dir/scripts/deploy_vps.py" --update-only
