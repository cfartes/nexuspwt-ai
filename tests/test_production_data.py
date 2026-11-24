import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import production_data as maintenance


class MaintenanceTests(unittest.TestCase):
    def test_clean_requires_explicit_flag_before_any_command(self):
        with patch.object(maintenance, 'output') as output:
            with self.assertRaisesRegex(ValueError, 'confirmar-limpeza'):
                maintenance.run('clean')
            output.assert_not_called()

    def scenario(self, failure=None, action='clean', pending=False, wrong_database=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'deploy').mkdir()
            (root / 'scripts').mkdir()
            (root / 'scripts' / 'production-data.ts').write_text('// fixture')
            database_url = 'postgresql://nexus:private-password@' + ('another-host' if wrong_database else 'database') + ':5432/nexus'
            env = root / 'deploy' / '.env.production'
            env.write_text('DATABASE_URL=' + database_url + '\nINTEGRATIONS_ENCRYPTION_KEY=' + 'e' * 64 + '\n')
            state = root / 'data' / 'deploy'
            state.mkdir(parents=True)
            (state / 'state.json').write_text(json.dumps({'active': {'project': 'nexus-ptw-r123'}, 'pending': {} if not pending else {'project': 'other'}}))
            database = {'Config': {'Labels': {'com.docker.compose.project': 'nexus-ptw'}, 'Env': ['POSTGRES_DB=nexus', 'POSTGRES_USER=nexus']}, 'NetworkSettings': {'Networks': {'nexus-ptw_database': {}}}, 'Mounts': [{'Type': 'volume', 'Destination': '/var/lib/postgresql/data'}]}
            def container(identifier, service, project):
                return {'Id': identifier, 'Config': {'Image': 'worker-image', 'Labels': {'com.docker.compose.project': project, 'com.docker.compose.service': service}}}
            containers = [container('app-id', 'app', 'nexus-ptw-r123'), container('worker-id', 'notifications', 'nexus-ptw-r123'), container('rotafy-id', 'app', 'nexus-rotafy')]
            commands = []
            def output(*command):
                if command[-3:] == ('ps', '-q', 'database'):
                    return 'database-id'
                if command == ('docker', 'inspect', 'database-id'):
                    return json.dumps([database])
                if command[:2] == ('docker', 'ps'):
                    return 'app-id\nworker-id\nrotafy-id'
                if command[:2] == ('docker', 'inspect'):
                    return json.dumps(containers)
                if command[:3] == ('docker', 'image', 'inspect'):
                    return '[{}]'
                raise AssertionError(command)
            def run(command, **kwargs):
                commands.append(command)
                self.assertFalse(any('private-password' in value or 'Teste!12' in value for value in command))
                if 'pg_dump' in command:
                    if failure == 'backup':
                        raise subprocess.CalledProcessError(1, command)
                    kwargs['stdout'].write(b'backup')
                if command[:2] == ['docker', 'run']:
                    self.assertTrue(any('type=bind,' in value and 'readonly' in value for value in command))
                    self.assertEqual(kwargs['env']['PTW_VALIDATION_PASSWORD'], 'Teste!12')
                    self.assertTrue(list((root / 'data').glob('.maintenance-*.env')))
                    if failure == 'operation':
                        raise subprocess.CalledProcessError(1, command)
            previous_umask = os.umask(0o077)
            try:
                with patch.object(maintenance, 'ROOT', root), patch.object(maintenance, 'output', side_effect=output), patch.object(maintenance.subprocess, 'run', side_effect=run), patch.dict(os.environ, {'PTW_VALIDATION_PASSWORD': 'Teste!12'}), contextlib.redirect_stdout(io.StringIO()):
                    if failure or pending or wrong_database:
                        with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                            maintenance.run(action, confirmed=True)
                    else:
                        maintenance.run(action, confirmed=True)
                self.assertEqual(env.read_text().splitlines()[0], 'DATABASE_URL=' + database_url)
                self.assertFalse(list((root / 'data').glob('.maintenance-*.env')))
                if pending or wrong_database:
                    self.assertEqual(commands, [])
                    return
                if action == 'reset-passwords':
                    self.assertFalse(any('stop' in command or 'start' in command for command in commands))
                else:
                    self.assertEqual(commands[0], ['docker', 'stop', '--time', '30', 'app-id', 'worker-id'])
                    self.assertEqual(commands[-1], ['docker', 'start', 'app-id', 'worker-id'])
                self.assertFalse(any('rotafy-id' in command or 'down' in command or 'prune' in command for command in commands))
                backups = list((root / 'data' / 'backups').glob('*.dump'))
                self.assertEqual(len(backups), 0 if failure == 'backup' else 1)
                if failure != 'backup':
                    self.assertEqual(backups[0].read_bytes(), b'backup')
                self.assertEqual(any(command[:2] == ['docker', 'run'] for command in commands), failure != 'backup')
            finally:
                os.umask(previous_umask)

    def test_clean_stops_only_this_app_backups_first_and_restarts(self):
        self.scenario()

    def test_seed_uses_same_environment_and_never_resets_database(self):
        self.scenario(action='seed')

    def test_backup_failure_never_runs_destructive_operation(self):
        self.scenario(failure='backup')

    def test_operation_failure_restarts_services_and_cleans_secret_file(self):
        self.scenario(failure='operation')

    def test_pending_deploy_refuses_before_stopping_anything(self):
        self.scenario(pending=True)

    def test_external_database_is_refused(self):
        self.scenario(wrong_database=True)

    def test_reset_passwords_backs_up_without_stopping_app(self):
        self.scenario(action='reset-passwords')

    def test_reset_passwords_never_runs_when_backup_fails(self):
        self.scenario(action='reset-passwords', failure='backup')


if __name__ == '__main__':
    unittest.main()
