"""Instalação Compose independente, usando o Traefik existente na VPS."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import fcntl
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / 'deploy' / '.env.production'


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def choose(label, candidates, configured=None):
    candidates = sorted(set(filter(None, candidates)))
    if configured:
        value = configured
    elif len(candidates) == 1:
        value = candidates[0]
    elif sys.stdin.isatty():
        print(f'{label}: opções detectadas: {", ".join(candidates) or "nenhuma"}')
        value = input(f'Informe {label}: ').strip()
    else:
        raise ValueError(f'Informe {label} no ambiente; detecção ambígua ou indisponível.')
    if not re.fullmatch(r'[A-Za-z0-9_.@+-]+', value):
        raise ValueError(f'{label} inválido.')
    return value


def routing(existing):
    ids = output('docker', 'ps', '-q').split()
    containers = json.loads(output('docker', 'inspect', *ids)) if ids else []
    proxies = [c for c in containers if 'traefik' in c['Config']['Image'].lower()]
    name = choose('TRAEFIK_CONTAINER', [c['Name'].lstrip('/') for c in proxies], os.getenv('TRAEFIK_CONTAINER'))
    proxy = next((c for c in proxies if c['Name'].lstrip('/') == name), None)
    if proxy is None:
        raise ValueError('Traefik informado não está em execução.')
    flags = proxy['Config'].get('Cmd') or []
    environment = proxy['Config'].get('Env') or []
    if any(flag.lower() == '--providers.docker.allowemptyservices=true' for flag in flags) or any(value.lower() == 'traefik_providers_docker_allowemptyservices=true' for value in environment):
        raise ValueError('Deploy online exige Traefik respeitando healthchecks (allowEmptyServices=false).')
    if any(f.lower() == '--providers.docker=false' or
           (f.lower().startswith('--providers.swarm') and not f.lower().endswith('=false')) or
           f.lower() == '--providers.docker.swarmmode=true' for f in flags):
        raise ValueError('Este instalador exige Traefik com provider Docker, sem Swarm.')
    networks = proxy['NetworkSettings']['Networks']
    network = choose('TRAEFIK_NETWORK', networks, os.getenv('TRAEFIK_NETWORK') or existing.get('TRAEFIK_NETWORK'))
    if network not in networks:
        raise ValueError('Traefik não pertence à rede informada.')
    metadata = json.loads(output('docker', 'network', 'inspect', network))[0]
    if metadata.get('Driver') != 'bridge' or metadata.get('Internal'):
        raise ValueError('A rede Traefik precisa ser bridge com saída para internet.')
    entries, resolvers = set(), set()
    for container in containers:
        if network not in container['NetworkSettings']['Networks']:
            continue
        labels = container['Config'].get('Labels') or {}
        for key, value in labels.items():
            if key.startswith('traefik.http.routers.') and key.endswith('.tls.certresolver'):
                resolvers.add(value)
                entries.update(labels.get(key.removesuffix('.tls.certresolver') + '.entrypoints', '').split(','))
    for flag in flags:
        match = re.match(r'--certificatesresolvers\.([^.]+)\.', flag, re.I)
        if match:
            resolvers.add(match[1])
        match = re.match(r'--entrypoints\.([^.]+)\.address=.*:443(?:/tcp)?$', flag, re.I)
        if match:
            entries.add(match[1])
    return {
        'TRAEFIK_NETWORK': network,
        'TRAEFIK_HTTPS_ENTRYPOINT': choose('TRAEFIK_HTTPS_ENTRYPOINT', entries, os.getenv('TRAEFIK_HTTPS_ENTRYPOINT') or existing.get('TRAEFIK_HTTPS_ENTRYPOINT')),
        'TRAEFIK_CERTRESOLVER': choose('TRAEFIK_CERTRESOLVER', resolvers, os.getenv('TRAEFIK_CERTRESOLVER') or existing.get('TRAEFIK_CERTRESOLVER')),
    }


def load_env(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                if not re.fullmatch(r'[A-Z_]+', key) or not value or any(c in value for c in '\r\n\"\' $`#'):
                    raise ValueError('Arquivo de ambiente inválido; use valores simples sem aspas.')
                result[key] = value
    return result


def main(update_only=False):
    os.umask(0o077)
    existing = load_env(ENV)
    update_only = update_only or bool(existing)
    if update_only and not existing:
        raise ValueError('Ambiente existente não encontrado. Nenhum banco será criado.')
    config = {} if update_only else routing(existing)
    if existing:
        required = {'POSTGRES_PASSWORD', 'DATABASE_URL', 'INTEGRATIONS_ENCRYPTION_KEY', 'BOOTSTRAP_EMAIL', 'BOOTSTRAP_PASSWORD'}
        if not required.issubset(existing):
            raise ValueError('Ambiente existente incompleto; credenciais não serão regeneradas.')
    else:
        password = secrets.token_hex(32)
        existing = {
            'POSTGRES_PASSWORD': password,
            'DATABASE_URL': f'postgresql://nexus:{password}@database:5432/nexus',
            'INTEGRATIONS_ENCRYPTION_KEY': secrets.token_hex(32),
            'BOOTSTRAP_EMAIL': choose('BOOTSTRAP_EMAIL', ['admin@nexus.local'], os.getenv('BOOTSTRAP_EMAIL')),
            'BOOTSTRAP_PASSWORD': 'A!' + secrets.token_urlsafe(24),
            'OPENWA_ALLOWED_ORIGINS': 'https://openwa.187-77-58-10.sslip.io',
            'OPENWA_DEFAULT_URL': 'https://openwa.187-77-58-10.sslip.io/api',
        }
    if not update_only:
        existing.update(config)
        existing['APP_URL'] = 'https://nexusptw.nexusdataanalytics.tech'
        temp = ENV.with_suffix('.tmp')
        with temp.open('w', encoding='utf-8') as file:
            file.write(''.join(f'{key}={value}\n' for key, value in existing.items()))
        temp.chmod(0o600)
        temp.replace(ENV)
    compose = ['docker', 'compose', '--env-file', str(ENV), '-f', str(ROOT / 'deploy' / 'compose.production.yml')]
    subprocess.run([*compose, 'config', '--quiet'], check=True)
    if update_only:
        container = output(*compose, 'ps', '-q', 'database')
        if not container:
            raise ValueError('PostgreSQL existente não está em execução. Inicie-o antes de atualizar.')
        metadata = json.loads(output('docker', 'inspect', container))[0]
        if not any(m.get('Type') == 'volume' and m.get('Destination') == '/var/lib/postgresql/data' for m in metadata.get('Mounts', [])):
            raise ValueError('Volume persistente do PostgreSQL não encontrado. Atualização cancelada.')
        schema = output(*compose, 'exec', '-T', 'database', 'psql', '-U', 'nexus', '-d', 'nexus', '-Atqc', "SELECT to_regclass('public.companies') IS NOT NULL AND to_regclass('public.users') IS NOT NULL")
        if schema != 't':
            raise ValueError('Banco existente não contém o schema do app. Atualização cancelada.')
        from rolling_deploy import RollingDeployment
        routing(existing)  # Validate the existing Docker/Traefik topology without changing it.
        lock_path = ROOT / 'data' / 'deploy.lock'
        lock_path.parent.mkdir(exist_ok=True)
        with lock_path.open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('Outra atualização já está em execução.') from None
            base = json.loads(output(*compose, 'config', '--format', 'json'))
            RollingDeployment(ROOT, compose, base).deploy()
        return
    # Build antes de tocar nos serviços existentes; credenciais ficam fora das imagens.
    release = output('git', '-C', str(ROOT), 'rev-parse', 'HEAD')
    subprocess.run([*compose, 'build', '--build-arg', 'APP_RELEASE=' + release, 'app', 'notifications'], check=True)
    if not update_only:
        subprocess.run([*compose, 'up', '-d', '--wait', 'database'], check=True)
    backups = ROOT / 'data' / 'backups'
    backups.mkdir(parents=True, exist_ok=True)
    backup = backups / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.dump')
    with backup.open('xb') as file:
        subprocess.run([*compose, 'exec', '-T', 'database', 'pg_dump', '-U', 'nexus', '-d', 'nexus', '-Fc'], stdout=file, check=True)
    # Evita que app e worker usem um schema parcialmente atualizado.
    subprocess.run([*compose, 'stop', 'app', 'notifications'], check=True)
    migration = ['--no-deps', '-e', 'BOOTSTRAP_EMAIL=', '-e', 'BOOTSTRAP_PASSWORD='] if update_only else []
    subprocess.run([*compose, '--profile', 'setup', 'run', '--rm', *migration, 'bootstrap'], check=True)
    dependencies = ['--no-deps'] if update_only else []
    subprocess.run([*compose, 'up', '-d', '--wait', *dependencies, 'app', 'notifications'], check=True)
    print(('Atualização' if update_only else 'Instalação') + ' concluída: https://nexusptw.nexusdataanalytics.tech')
    print(f'Credenciais do superadmin: BOOTSTRAP_EMAIL e BOOTSTRAP_PASSWORD em {ENV} (acesso restrito).')
    print(f'Backup anterior à migração: {backup}. Copie backups para armazenamento externo.')
    if update_only:
        print('PostgreSQL, dados, credenciais e configuração preservados. Confira o app após atualizar.')
    else:
        print('Configure Resend e OpenWA no superadmin; chaves locais não são copiadas automaticamente.')
        print('Confira o DNS, certificado HTTPS e teste um convite real antes de liberar o acesso.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--update-only']):
            raise ValueError('Uso: deploy_vps.py [--update-only]')
        main(update_only=sys.argv[1:] == ['--update-only'])
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        # Não imprime argumentos de subprocessos ou conteúdo do ambiente com segredos.
        print(f'Operação interrompida: {error if isinstance(error, ValueError) else type(error).__name__}. Dados preservados.', file=sys.stderr)
        sys.exit(1)
