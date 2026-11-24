#!/usr/bin/env bash
set -Eeuo pipefail
install_dir="${PTW_INSTALL_DIR:-/opt/nexus-ptw}"
[[ "$install_dir" == /* && "$install_dir" != / && -f "$install_dir/scripts/production_data.py" ]] || { printf 'Instalação não encontrada. Atualize o repositório primeiro.\n' >&2; exit 1; }
exec python3 "$install_dir/scripts/production_data.py" clean "$@"
