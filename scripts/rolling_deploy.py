"""Blue/green app updates behind the existing Traefik; PostgreSQL is untouched."""
import copy
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def save(path, value, mode=0o600):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(value, encoding='utf-8')
    temporary.chmod(mode)
    temporary.replace(path)


def gateway_config(target):
    if not re.fullmatch(r'nexus-ptw-[a-z0-9-]+', target):
        raise ValueError('Nome do destino inválido.')
    return f'''resolver 127.0.0.11 valid=5s ipv6=off;
upstream ptw {{ zone ptw 64k; server {target}:3000 resolve; }}
server {{
  listen 80;
  access_log off;
  error_log /dev/stderr crit;
  client_max_body_size 16m;
  location ^~ /_next/static/ {{
    alias /srv/static/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options nosniff always;
  }}
  location / {{
    proxy_pass http://ptw;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
  }}
}}
'''


def candidate_config(base, project, images, database_network):
    services = {}
    for name in ('app', 'notifications'):
        service = copy.deepcopy(base['services'][name])
        for key in ('build', 'depends_on', 'container_name', 'ports', 'profiles'):
            service.pop(key, None)
        service['image'] = images[name]
        service['labels'] = {'traefik.enable': 'false'}
        service['networks'] = {'database': {}, 'egress': {}}
        if name == 'app':
            service['networks']['traefik'] = {'aliases': [project + '-app']}
            service['stop_grace_period'] = '190s'
            service['healthcheck'] = {
                'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],
                'interval': '5s', 'timeout': '5s', 'retries': 24,
            }
        services[name] = service
    return {
        'name': project, 'services': services,
        'networks': {
            'database': {'external': True, 'name': database_network},
            'traefik': {'external': True, 'name': base['networks']['traefik']['name']},
            'egress': {},
        },
    }


class RollingDeployment:
    def __init__(self, root, compose, base):
        self.root, self.compose, self.base = root, compose, base
        self.directory = root / 'data' / 'deploy'
        self.directory.mkdir(parents=True, exist_ok=True)
        self.state_path = self.directory / 'state.json'
        self.gateway_dir = self.directory / 'gateway'
        self.gateway_dir.mkdir(exist_ok=True, mode=0o755)
        self.gateway_file = self.directory / 'gateway.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else None

    def persist(self):
        save(self.state_path, json.dumps(self.state, indent=2))

    def target(self, target, *args):
        return run('docker', 'compose', '-p', target['project'], '-f', target['compose'], *args)

    def edge(self, *args):
        return run('docker', 'compose', '-p', 'nexus-ptw-edge', '-f', str(self.gateway_file), *args)

    def switch(self, target):
        upstream = target.get('upstream', target['project'] + '-app')
        save(self.gateway_dir / 'active.conf', gateway_config(upstream), 0o644)
        if self.edge('ps', '-q', 'gateway'):
            self.edge('exec', '-T', 'gateway', 'nginx', '-t')
            self.edge('exec', '-T', 'gateway', 'nginx', '-s', 'reload')
        else:
            self.edge('up', '-d', '--wait', '--wait-timeout', '120', 'gateway')

    def verify(self, release):
        for _ in range(30):
            try:
                request = urllib.request.Request(
                    'https://nexusptw.nexusdataanalytics.tech/api/health?probe=' + str(time.time_ns()),
                    headers={'Cache-Control': 'no-cache', 'User-Agent': 'NexusPTW-Deployment/1.0'},
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    value = json.load(response)
                if isinstance(value, dict) and value.get('ok') and value.get('release') == release:
                    return
            except (urllib.error.URLError, TimeoutError, ValueError):
                time.sleep(1)
                continue
            time.sleep(1)
        raise ValueError('A nova versão não foi confirmada pelo HTTPS público.')

    def restore(self):
        active, pending = self.state['active'], self.state['pending']
        self.target(pending, 'stop', 'notifications')
        self.target(active, 'start', 'app', 'notifications')
        self.switch(active)
        self.target(pending, 'stop', 'app')
        self.state['pending'] = None
        self.persist()
        print('Versão anterior restaurada; banco e arquivos preservados.')

    def deploy(self):
        if self.state and self.state.get('pending'):
            print('Recuperando tentativa anterior interrompida…')
            self.restore()
        release = run('git', '-C', str(self.root), 'rev-parse', 'HEAD')
        if not re.fullmatch(r'[a-f0-9]{40}', release):
            raise ValueError('Release inválida.')
        # Images are prepared while the active app continues serving requests.
        print('Construindo a nova versão; app atual permanece disponível…', flush=True)
        subprocess.run([*self.compose, 'build', '--build-arg', 'APP_RELEASE=' + release, 'app', 'notifications'], check=True)
        run('docker', 'pull', 'nginx:1.28-alpine')
        database_id = run(*self.compose, 'ps', '-q', 'database')
        database = json.loads(run('docker', 'inspect', database_id))[0]
        database_networks = [name for name in database['NetworkSettings']['Networks'] if name.endswith('_database')]
        if len(database_networks) != 1:
            raise ValueError('Rede do PostgreSQL não identificada com segurança.')
        images = {name: run('docker', 'image', 'inspect', '--format', '{{.Id}}', self.base['services'][name]['image']) for name in ('app', 'notifications')}
        project = 'nexus-ptw-r' + str(time.time_ns())
        candidate = {'project': project, 'compose': str(self.directory / (project + '.json')), 'release': release}
        save(Path(candidate['compose']), json.dumps(candidate_config(self.base, project, images, database_networks[0])))
        if not self.state:
            # Snapshot running image IDs before mutable local image tags can be reused.
            legacy = copy.deepcopy(self.base)
            legacy['services'] = {name: legacy['services'][name] for name in ('app', 'notifications')}
            legacy_upstream = None
            for name, service in legacy['services'].items():
                container_id = run(*self.compose, 'ps', '-q', name)
                if not container_id:
                    raise ValueError('App e worker existentes precisam estar em execução.')
                container = json.loads(run('docker', 'inspect', container_id))[0]
                service['image'] = container['Image']
                if name == 'app':
                    legacy_upstream = container['Name'].lstrip('/')
                for key in ('build', 'depends_on'):
                    service.pop(key, None)
            legacy['networks'] = {name: {'external': True, 'name': network['name']} for name, network in self.base['networks'].items()}
            legacy_path = self.directory / 'legacy.json'
            save(legacy_path, json.dumps(legacy))
            self.state = {'active': {'project': self.base['name'], 'compose': str(legacy_path), 'legacy': True, 'upstream': legacy_upstream}, 'pending': None, 'previous': None}
            self.persist()
        active = self.state['active']
        volume = 'nexus-ptw-public-static'
        run('docker', 'volume', 'create', volume)
        old_image = json.loads(Path(active['compose']).read_text())['services']['app']['image']
        # Reuse RotaFY's append-only public asset volume so old tabs retain lazy chunks.
        for image in dict.fromkeys([old_image, images['app']]):
            run('docker', 'run', '--rm', '--network', 'none', '--user', 'root', '-v', volume + ':/assets', '--entrypoint', 'sh', image, '-c', 'cp -a /app/.next/static/. /assets/')
        gateway = {
            'services': {'gateway': {
                'image': 'nginx:1.28-alpine', 'restart': 'unless-stopped', 'stop_grace_period': '190s',
                'networks': ['traefik'],
                'volumes': [str(self.gateway_dir) + ':/etc/nginx/conf.d:ro', volume + ':/srv/static:ro'],
                'healthcheck': {'test': ['CMD', 'nginx', '-t'], 'interval': '5s', 'timeout': '3s', 'retries': 12},
                'labels': {
                    'traefik.enable': 'true', 'traefik.docker.network': self.base['networks']['traefik']['name'],
                    'traefik.http.routers.nexus-ptw-edge.rule': 'Host(`nexusptw.nexusdataanalytics.tech`)',
                    'traefik.http.routers.nexus-ptw-edge.priority': '1000',
                    'traefik.http.routers.nexus-ptw-edge.entrypoints': self.base['services']['app']['labels']['traefik.http.routers.nexus-ptw.entrypoints'],
                    'traefik.http.routers.nexus-ptw-edge.tls': 'true',
                    'traefik.http.routers.nexus-ptw-edge.tls.certresolver': self.base['services']['app']['labels']['traefik.http.routers.nexus-ptw.tls.certresolver'],
                    'traefik.http.routers.nexus-ptw-edge.service': 'nexus-ptw-edge',
                    'traefik.http.services.nexus-ptw-edge.loadbalancer.server.port': '80',
                },
            }},
            'networks': {'traefik': {'external': True, 'name': self.base['networks']['traefik']['name']}},
            'volumes': {volume: {'external': True, 'name': volume}},
        }
        save(self.gateway_file, json.dumps(gateway))
        backups = self.root / 'data' / 'backups'
        backups.mkdir(exist_ok=True)
        with (backups / (project + '.dump')).open('xb') as backup:
            subprocess.run([*self.compose, 'exec', '-T', 'database', 'pg_dump', '-U', 'nexus', '-d', 'nexus', '-Fc'], stdout=backup, check=True)
        # Online migration policy refuses unreviewed SQL and rolls back on lock timeout.
        subprocess.run([*self.compose, '--profile', 'setup', 'run', '--rm', '--no-deps', '--entrypoint', 'node', 'bootstrap', 'scripts/migrate-online.mjs'], check=True)
        self.state['pending'] = candidate
        self.persist()
        try:
            self.target(candidate, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '150', 'app')
            self.target(active, 'stop', 'notifications')
            self.target(candidate, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '60', 'notifications')
            print('Nova instância pronta. Trocando tráfego sem reiniciar o Traefik…', flush=True)
            self.switch(candidate)
            self.verify(release)
        except BaseException:
            self.restore()
            raise
        previous = self.state.get('previous')
        self.state = {'active': candidate, 'previous': active, 'pending': None}
        self.persist()
        print('Nova versão publicada. O app já pode avisar os usuários. Drenando requisições antigas por 190 segundos…', flush=True)
        time.sleep(190)
        self.target(active, 'stop', 'app')
        if previous:
            self.target(previous, 'stop', 'app', 'notifications')
            if not previous.get('legacy'):
                self.target(previous, 'down')
        print('Atualização concluída. PostgreSQL, sessões, documentos e filas preservados.')
