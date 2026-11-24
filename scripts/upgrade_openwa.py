"""Atualiza somente o OpenWA, mantendo compose, override de mídia e volumes existentes."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

ROOT = Path('/opt/openwa')
IMAGE = 'ghcr.io/rmyndharis/openwa:0.32.0'
VERSION = '0.32.0'
CONTAINER = 'openwa-api'
LOGIN_FIX = '38eb45b2759450cc6fccb6a7a3f2cbc3bdb87db2'
LOGIN_FIX_SHA256 = 'fee22b717aede8e1f11821d59d2ac910b6a2e851ade39b84c0006476d6286f7e'


def output(*command):
    return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL).strip()


def save(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)


def volume_sources(config, service):
    result = {}
    for mount in config['services'][service].get('volumes', []):
        kind, source = mount['type'], mount.get('source', '')
        if kind == 'volume':
            source = config['volumes'][source]['name']
        if kind in ('volume', 'bind'):
            result[mount['target']] = (kind, source)
    return result


def build_login_image(original):
    if not shutil.which('git'):
        raise ValueError('Git precisa estar instalado para conferir e aplicar o patch oficial. Nenhum serviço foi parado.')
    if original['Config']['Labels'].get('io.nexus.wwebjs-login-fix') == LOGIN_FIX:
        raise ValueError('A imagem ativa já contém este patch. Nenhum serviço foi parado; confira o erro atual da sessão.')
    versions = output('docker', 'exec', CONTAINER, 'node', '-p',
                      "require('/app/package.json').version+' '+require('/app/node_modules/whatsapp-web.js/package.json').version")
    if versions != VERSION + ' 1.34.8':
        raise ValueError('Este patch exige OpenWA 0.32.0 e whatsapp-web.js 1.34.8. Nenhum serviço foi parado.')
    print('Preparando patch oficial do login; sessões atuais continuam ativas.', flush=True)
    with urllib.request.urlopen(f'https://github.com/wwebjs/whatsapp-web.js/commit/{LOGIN_FIX}.diff', timeout=30) as response:
        patch = response.read(1_000_001)
    if hashlib.sha256(patch).hexdigest() != LOGIN_FIX_SHA256:
        raise ValueError('O patch baixado não corresponde ao SHA-256 verificado. Nenhum serviço foi parado.')
    with tempfile.TemporaryDirectory(prefix='nexus-openwa-login-') as directory:
        context = Path(directory)
        (context / 'src').mkdir()
        subprocess.run(['docker', 'cp', CONTAINER + ':/app/node_modules/whatsapp-web.js/src/Client.js', str(context / 'src' / 'Client.js')], check=True)
        (context / 'login.patch').write_bytes(patch)
        subprocess.run(['git', 'init', '--quiet', str(context)], check=True)
        before = (context / 'src' / 'Client.js').read_bytes()
        # Apply hunks to the installed file, keeping OpenWA's existing patches; conflicts abort.
        for flags in (['--check'], []):
            result = subprocess.run(['git', 'apply', *flags, 'login.patch'], cwd=context, capture_output=True, text=True)
            if result.returncode:
                raise ValueError('O patch oficial conflita com a biblioteca instalada. Nenhum serviço foi parado. ' + result.stderr.strip())
        if (context / 'src' / 'Client.js').read_bytes() == before:
            raise ValueError('O patch não alterou a biblioteca. Nenhum serviço foi parado.')
        base_image = 'nexus-openwa-login-base:' + original['Image'].split(':')[-1][:12]
        target = 'nexus-openwa-login:' + original['Image'].split(':')[-1][:12] + '-' + LOGIN_FIX[:12]
        subprocess.run(['docker', 'tag', original['Image'], base_image], check=True)
        (context / 'Dockerfile').write_text(f'FROM {base_image}\nCOPY --chmod=0644 src/Client.js /app/node_modules/whatsapp-web.js/src/Client.js\nLABEL io.nexus.wwebjs-login-fix="{LOGIN_FIX}"\n')
        (context / '.dockerignore').write_text('.git\nlogin.patch\n')
        subprocess.run(['docker', 'build', '--pull=false', '--network=none', '-t', target, str(context)], check=True)
        subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', target, '--check', '/app/node_modules/whatsapp-web.js/src/Client.js'], check=True)
        return target


def main(fix_login=False):
    os.umask(0o077)
    base, media = ROOT / 'docker-compose.yml', ROOT / 'nexus-media.override.yml'
    managed = ROOT / 'nexus-version.override.json'
    if not base.is_file() or not media.is_file():
        raise ValueError('Compose e override de mídia esperados não encontrados em /opt/openwa.')
    with (ROOT / '.nexus-upgrade.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Outra atualização do OpenWA está em andamento.') from None
        original = json.loads(output('docker', 'inspect', CONTAINER))[0]
        labels = original['Config']['Labels']
        project, service = labels['com.docker.compose.project'], labels['com.docker.compose.service']
        working_directory = Path(labels.get('com.docker.compose.project.working_dir') or str(ROOT))
        files = [str((working_directory / item.strip()).resolve()) for item in labels['com.docker.compose.project.config_files'].split(',') if item.strip()]
        print(f'Projeto Compose: {project} | Serviço: {service} | Container: {CONTAINER}', flush=True)
        print('Arquivos ativos: ' + ', '.join(files), flush=True)
        expected = [str(base.resolve()), str(media.resolve())]
        if files not in (expected, [*expected, str(managed.resolve())]) or not service:
            raise ValueError('Arquivos Compose diferentes dos esperados. Confira a lista exibida; nenhum serviço foi parado.')
        if not original['State']['Running']:
            raise ValueError('O container OpenWA precisa estar ativo para identificar a configuração atual.')
        if not any(mount['Destination'] == '/app/data' for mount in original['Mounts']):
            raise ValueError('Volume persistente /app/data não identificado. Nenhum serviço foi parado.')
        compose = ['docker', 'compose', '--project-directory', str(ROOT), '-p', project, '-f', str(base), '-f', str(media)]
        if str(managed.resolve()) in files:
            compose.extend(['-f', str(managed)])
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = ROOT / 'backups' / ('nexus-upgrade-' + stamp)
        backup.mkdir(parents=True, mode=0o700)
        backup.chmod(0o700)
        for path in [base, media, ROOT / '.env', managed]:
            if path.exists():
                shutil.copy2(path, backup / path.name)
        save(backup / 'container-before.json', original)
        old_image = 'nexus-openwa-rollback:' + stamp.lower()
        subprocess.run(['docker', 'tag', original['Image'], old_image], check=True)
        (backup / 'rollback-image.txt').write_text(old_image + '\n')
        runtime = dict(value.split('=', 1) for value in original['Config']['Env'] if '=' in value)
        node_id = output('docker', 'exec', CONTAINER, 'node', '-e',
                         "const fs=require('fs'),p=require('path').resolve(process.env.OPENWA_DATA_DIR||'./data','.env.generated');const cfg=fs.existsSync(p)?require('dotenv').parse(fs.readFileSync(p)):{};process.stdout.write(process.env.NODE_ID||cfg.NODE_ID||require('os').hostname())")
        if not node_id or '\n' in node_id or '\r' in node_id:
            raise ValueError('Identidade do nó OpenWA não identificada. Nenhum serviço foi parado.')
        backup_override = backup / 'backup-compose.json'
        save(backup_override, {'services': {service: {'image': old_image, 'environment': runtime}}})
        target_image = build_login_image(original) if fix_login else IMAGE
        candidate = backup / 'candidate-compose.json'
        candidate_config = json.loads(managed.read_text()) if managed.exists() else {'services': {service: {}}}
        candidate_service = candidate_config['services'][service]
        candidate_service['image'] = target_image
        candidate_service.setdefault('environment', {}).update({
            'WWEBJS_WEB_VERSION': 'off', 'NODE_ID': node_id,
        })
        save(candidate, candidate_config)
        upgrade = [*compose, '-f', str(candidate)]
        config = json.loads(output(*upgrade, 'config', '--format', 'json'))
        if config.get('services', {}).get(service, {}).get('container_name') != CONTAINER:
            raise ValueError('O serviço identificado não corresponde ao container openwa-api no Compose. Nenhum serviço foi parado.')
        actual_mounts = {mount['Destination']: (mount['Type'], mount.get('Name') if mount['Type'] == 'volume' else mount['Source']) for mount in original['Mounts'] if mount['Type'] in ('volume', 'bind')}
        if volume_sources(config, service) != actual_mounts:
            raise ValueError('Os volumes do Compose diferem dos volumes ativos. Nenhum serviço foi parado.')
        for key, value in config['services'][service].get('environment', {}).items():
            if value is not None and key.startswith(('DATABASE_', 'MAIN_DATABASE_', 'POSTGRES_', 'API_', 'STORAGE_', 'S3_', 'SESSION_DATA_PATH', 'BAILEYS_AUTH_DIR', 'OPENWA_DATA_DIR', 'PLUGIN')) and str(value) != runtime.get(key):
                raise ValueError('Configuração de banco, chaves ou armazenamento difere do container ativo. Revise o Compose/.env antes de atualizar.')
        if not fix_login:
            print(f'Baixando OpenWA {VERSION}; container atual continua ativo.', flush=True)
            subprocess.run(['docker', 'pull', target_image], check=True)
        if output('docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', target_image, '-p', "require('/app/package.json').version") != VERSION:
            raise ValueError('A imagem baixada não corresponde à versão esperada.')
        stopped = False
        changed = False
        try:
            print('Pausando somente openwa-api para obter backup consistente de bancos e autenticações.', flush=True)
            stopped = True
            subprocess.run(['docker', 'stop', '--time', '60', CONTAINER], check=True)
            # The old image understands its own config; its official backup captures SQLite/Postgres and auth.
            print(f'Criando o backup. Log privado: {backup / "backup.log"}', flush=True)
            with (backup / 'backup.log').open('w') as log:
                subprocess.run([*compose, '-f', str(backup_override), 'run', '--rm', '--no-deps', '--pull', 'never',
                                '--user', '0:0', '--entrypoint', 'bash', '-e', 'BACKUP_DIR=/backup', '-e', 'TMPDIR=/backup',
                                '-v', f'{backup}:/backup', service, '/app/scripts/backup.sh'], stdout=log, stderr=subprocess.STDOUT, check=True)
            archives = list(backup.glob('openwa-backup-*.tar.gz'))
            if len(archives) != 1 or not archives[0].stat().st_size:
                raise ValueError('Backup completo não identificado. A atualização não será aplicada.')
            subprocess.run(['tar', '-tzf', str(archives[0])], check=True, stdout=subprocess.DEVNULL)
            print(f'Backup completo: {archives[0]}', flush=True)
            save(managed, json.loads(candidate.read_text()))
            upgrade = compose if str(managed.resolve()) in files else [*compose, '-f', str(managed)]
            changed = True
            print(f'Aplicando migrações. Log privado: {backup / "migration.log"}', flush=True)
            with (backup / 'migration.log').open('w') as log:
                subprocess.run([*upgrade, 'run', '--rm', '--no-deps', '--pull', 'never', '--entrypoint', 'npm', service, 'run', 'migration:run:prod'], stdout=log, stderr=subprocess.STDOUT, check=True)
            print('Iniciando a nova versão e aguardando a saúde do serviço (até 180 segundos).', flush=True)
            subprocess.run([*upgrade, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', service], check=True)
            if output('docker', 'exec', CONTAINER, 'node', '-p', "require('/app/package.json').version") != VERSION:
                raise ValueError('A versão em execução não foi confirmada.')
            if fix_login and output('docker', 'inspect', '--format', '{{index .Config.Labels "io.nexus.wwebjs-login-fix"}}', CONTAINER) != LOGIN_FIX:
                raise ValueError('O patch na imagem em execução não foi confirmado.')
        except BaseException:
            if stopped and not changed:
                subprocess.run(['docker', 'start', CONTAINER], check=True)
            elif changed:
                subprocess.run([*upgrade, 'stop', service], check=False)
                print(f'Atualização interrompida após iniciar migrações. Backup e logs privados: {backup}. Não faça downgrade apenas trocando a imagem; restaure primeiro o backup conforme o guia.', file=sys.stderr)
            raise
        print(f'OpenWA {VERSION} iniciado e saudável. Volumes e override de mídia preservados.', flush=True)
        print('No painel, confira as sessões anteriores e inicie as que permanecerem paradas. Depois reconecte a sessão Nexus PTW. Nenhuma mensagem de teste foi enviada.')
        print('Use também -f /opt/openwa/nexus-version.override.json nos próximos comandos Compose deste OpenWA.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--fix-login']):
            raise ValueError('Uso: python3 upgrade_openwa.py [--fix-login]')
        main(fix_login='--fix-login' in sys.argv)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyError, subprocess.CalledProcessError):
        print('Atualização do OpenWA não concluída. Confira o backup/logs indicados. Docker, Traefik e bancos dos outros apps não foram reiniciados.', file=sys.stderr)
        sys.exit(1)
