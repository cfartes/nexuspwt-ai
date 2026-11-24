"""Manutenção explícita do banco existente, sem reinstalar serviços."""
import argparse
import fcntl
import getpass
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlsplit
from deploy_vps import load_env

ROOT = Path(__file__).resolve().parents[1]


def output(*command):
    return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL).strip()


def run(action, confirmed=False):
    if action == 'clean' and not confirmed:
        raise ValueError('A limpeza apaga empresas, usuários comuns, APR/PT, fotos, arquivos, filas e históricos. Execute com --confirmar-limpeza. Superadmins e Resend/OpenWA globais serão preservados.')
    os.umask(0o077)
    environment = load_env(ROOT / 'deploy' / '.env.production')
    if not {'DATABASE_URL', 'INTEGRATIONS_ENCRYPTION_KEY'}.issubset(environment):
        raise ValueError('Instalação de produção existente não encontrada.')
    data = ROOT / 'data'
    data.mkdir(exist_ok=True)
    if not data.resolve().is_relative_to(ROOT):
        raise ValueError('Diretório de dados fora da instalação.')
    with (data / 'update.lock').open('a') as update_lock, (data / 'deploy.lock').open('a') as deploy_lock:
        for lock in (update_lock, deploy_lock):
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('Há uma atualização ou manutenção em andamento.') from None
        compose = ['docker', 'compose', '--env-file', str(ROOT / 'deploy' / '.env.production'), '-f', str(ROOT / 'deploy' / 'compose.production.yml')]
        database_id = output(*compose, 'ps', '-q', 'database')
        if not database_id or '\n' in database_id:
            raise ValueError('PostgreSQL existente não está em execução.')
        database = json.loads(output('docker', 'inspect', database_id))[0]
        if database['Config']['Labels'].get('com.docker.compose.project') != 'nexus-ptw':
            raise ValueError('PostgreSQL de outro projeto. Operação cancelada.')
        database_environment = dict(value.split('=', 1) for value in database['Config']['Env'] if '=' in value)
        target = urlsplit(environment['DATABASE_URL'])
        if target.hostname != 'database' or target.port not in (None, 5432) or target.path != '/' + database_environment.get('POSTGRES_DB', '') or target.username != database_environment.get('POSTGRES_USER'):
            raise ValueError('DATABASE_URL não corresponde ao PostgreSQL local do Nexus PTW.')
        networks = [name for name in database['NetworkSettings']['Networks'] if name.endswith('_database')]
        if len(networks) != 1 or not any(mount.get('Type') == 'volume' and mount.get('Destination') == '/var/lib/postgresql/data' for mount in database.get('Mounts', [])):
            raise ValueError('Rede ou volume persistente do PostgreSQL não identificado.')
        state_path = data / 'deploy' / 'state.json'
        if state_path.exists():
            state = json.loads(state_path.read_text())
            if state.get('pending'):
                raise ValueError('Deploy interrompido pendente. Conclua a atualização antes da manutenção.')
            active_project = state['active']['project']
        else:
            active_project = 'nexus-ptw'
        ids = output('docker', 'ps', '--filter', 'label=com.docker.compose.project', '--format', '{{.ID}}').splitlines()
        containers = json.loads(output('docker', 'inspect', *ids)) if ids else []
        running = [container for container in containers if
                   (container['Config']['Labels'].get('com.docker.compose.project') == 'nexus-ptw' or re.fullmatch(r'nexus-ptw-r\d+', container['Config']['Labels'].get('com.docker.compose.project', ''))) and
                   container['Config']['Labels'].get('com.docker.compose.service') in ('app', 'notifications')]
        workers = [container for container in running if container['Config']['Labels'].get('com.docker.compose.project') == active_project and container['Config']['Labels'].get('com.docker.compose.service') == 'notifications']
        if len(workers) != 1 or not any(container['Config']['Labels'].get('com.docker.compose.project') == active_project and container['Config']['Labels'].get('com.docker.compose.service') == 'app' for container in running):
            raise ValueError('App/worker ativos não identificados. Nenhum serviço foi parado.')
        image = workers[0]['Config']['Image']
        output('docker', 'image', 'inspect', image)
        child_environment = os.environ.copy()
        if action == 'seed' and not child_environment.get('PTW_VALIDATION_PASSWORD'):
            if not sys.stdin.isatty():
                raise ValueError('Defina PTW_VALIDATION_PASSWORD para a carga ou execute em terminal interativo.')
            password = getpass.getpass('Senha dos usuários FICTÍCIOS (8+ caracteres, maiúscula e símbolo): ')
            if password != getpass.getpass('Repita a senha: '):
                raise ValueError('As senhas são diferentes.')
            child_environment['PTW_VALIDATION_PASSWORD'] = password
        backups = data / 'backups'
        backups.mkdir(exist_ok=True)
        if not backups.resolve().is_relative_to(data.resolve()):
            raise ValueError('Diretório de backup fora dos dados da instalação.')
        backup = backups / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + action + '.dump')
        temporary = None
        stopped = []
        try:
            print('Pausando somente app e workers do Nexus PTW. PostgreSQL e Traefik permanecem ativos.', flush=True)
            # Register before stopping so an interrupted stop is also recovered.
            stopped = [container['Id'] for container in running]
            subprocess.run(['docker', 'stop', '--time', '30', *stopped], check=True, stdout=subprocess.DEVNULL)
            partial_backup = backup.with_suffix('.dump.partial')
            with partial_backup.open('xb') as file:
                subprocess.run([*compose, 'exec', '-T', 'database', 'pg_dump', '-U', database_environment['POSTGRES_USER'], '-d', database_environment['POSTGRES_DB'], '-Fc'], stdout=file, check=True)
            if not partial_backup.stat().st_size:
                raise ValueError('Backup vazio. Nenhum dado foi alterado.')
            partial_backup.rename(backup)
            print(f'Backup anterior à operação: {backup}', flush=True)
            with tempfile.NamedTemporaryFile(mode='w', dir=data, prefix='.maintenance-', suffix='.env', delete=False) as file:
                temporary = Path(file.name)
                for key in ('DATABASE_URL', 'INTEGRATIONS_ENCRYPTION_KEY'):
                    value = environment[key]
                    if '\n' in value or '\r' in value:
                        raise ValueError('Configuração de ambiente inválida.')
                    file.write(f'{key}={value}\n')
            subprocess.run(['docker', 'run', '--rm', '--network', networks[0], '--env-file', str(temporary),
                            '--env', 'PTW_VALIDATION_PASSWORD', '--mount', f'type=bind,source={ROOT / "scripts" / "production-data.ts"},target=/app/scripts/production-data.ts,readonly',
                            '--mount', f'type=bind,source={ROOT / "src" / "lib"},target=/app/src/lib,readonly',
                            '--entrypoint', 'node', image, '--import', 'tsx', 'scripts/production-data.ts', action, *(['--confirmar-limpeza'] if action == 'clean' else [])], check=True, env=child_environment)
        finally:
            try:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
            finally:
                if stopped:
                    print('Reiniciando os mesmos serviços que estavam ativos.', flush=True)
                    subprocess.run(['docker', 'start', *stopped], check=True, stdout=subprocess.DEVNULL)
        print('Operação concluída. Superadmins e configurações globais preservados. Faça novo login.', flush=True)
        if action == 'clean':
            print('A base ficou sem empresa/unidade. Execute seed_validation.sh antes de validar o app.')
        else:
            print('Carga fictícia sem APR/PT e sem mensagens. Contas usam a senha informada; troque contatos fictícios para testar entregas reais.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['clean', 'seed'])
    parser.add_argument('--confirmar-limpeza', action='store_true')
    args = parser.parse_args()
    try:
        run(args.action, args.confirmar_limpeza)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (subprocess.CalledProcessError, OSError, KeyError):
        print('Operação interrompida. Confira pré-requisitos, confirmação e backup exibido. Nenhuma reinstalação do PostgreSQL foi executada.', file=sys.stderr)
        sys.exit(1)
