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
import upgrade_openwa as upgrade


class OpenwaUpgradeTests(unittest.TestCase):
    def scenario(self, fail=None, wrong_mount=False, wrong_environment=False, service='openwa-api', relative_files=False, wrong_container=False, extra_file=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, media = root / 'docker-compose.yml', root / 'nexus-media.override.yml'
            base.write_text('original compose')
            media.write_text('original media override')
            (root / '.env').write_text('PRIVATE_KEY=kept-secret\n')
            original = {
                'Image': 'old-image-id', 'State': {'Running': True},
                'Config': {'Hostname': 'old-node-id', 'Env': ['API_MASTER_KEY=kept-secret'], 'Labels': {
                    'com.docker.compose.project': 'openwa', 'com.docker.compose.service': service,
                    'com.docker.compose.project.working_dir': str(root),
                    'com.docker.compose.project.config_files': ('docker-compose.yml, nexus-media.override.yml ' if relative_files else f'{base},{media}') + (',/other/unknown.yml' if extra_file else ''),
                }},
                'Mounts': [{'Type': 'volume', 'Name': 'openwa_data', 'Destination': '/app/data'}],
            }
            if wrong_environment:
                original['Config']['Env'].append('DATABASE_NAME=existing')
            commands = []
            def output(*command):
                if command[:3] == ('docker', 'inspect', 'openwa-api'):
                    return json.dumps([original])
                if command[-3:] == ('config', '--format', 'json'):
                    return json.dumps({'services': {service: {'container_name': 'another-app' if wrong_container else 'openwa-api', 'environment': {'DATABASE_NAME': 'other'} if wrong_environment else {}, 'volumes': [{'type': 'volume', 'source': 'data', 'target': '/app/data'}]}}, 'volumes': {'data': {'name': 'wrong' if wrong_mount else 'openwa_data'}}})
                if command[0:2] == ('docker', 'exec') and command[-2] == '-e':
                    return 'old-node-id'
                if command[0:2] == ('docker', 'run') or command[0:2] == ('docker', 'exec'):
                    return upgrade.VERSION
                raise AssertionError(command)
            def run(command, **kwargs):
                commands.append(command)
                self.assertFalse(any('kept-secret' in value for value in command))
                if '--rm' in command and 'compose' in command:
                    self.assertNotIn('--no-build', command)
                    self.assertNotIn('--build', command)
                    self.assertEqual(command[command.index('--pull') + 1], 'never')
                if '/app/scripts/backup.sh' in command:
                    self.assertIn(['docker', 'stop', '--time', '60', 'openwa-api'], commands)
                    self.assertIn('--no-deps', command)
                    self.assertEqual(command[command.index('--entrypoint') + 1], 'bash')
                    if fail == 'backup':
                        raise subprocess.CalledProcessError(1, command)
                    backup = next((root / 'backups').glob('nexus-upgrade-*'))
                    (backup / 'openwa-backup-test.tar.gz').write_bytes(b'archive fixture')
                if 'migration:run:prod' in command and fail == 'migration':
                    raise subprocess.CalledProcessError(1, command)
                if 'up' in command and fail == 'health':
                    raise subprocess.CalledProcessError(1, command)
            previous_umask = os.umask(0o077)
            try:
                with patch.object(upgrade, 'ROOT', root), patch.object(upgrade, 'output', side_effect=output), patch.object(upgrade.subprocess, 'run', side_effect=run), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    if fail or wrong_mount or wrong_environment or wrong_container or extra_file:
                        with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                            upgrade.main()
                    else:
                        upgrade.main()
                self.assertEqual(base.read_text(), 'original compose')
                self.assertEqual(media.read_text(), 'original media override')
                self.assertEqual((root / '.env').read_text(), 'PRIVATE_KEY=kept-secret\n')
                self.assertFalse(any('down' in command or '--volumes' in command or 'prune' in command for command in commands))
                if wrong_mount or wrong_environment or wrong_container or extra_file:
                    self.assertFalse(any('stop' in command for command in commands))
                    return
                backup = next((root / 'backups').glob('nexus-upgrade-*'))
                self.assertEqual((backup.stat().st_mode & 0o777), 0o700)
                self.assertEqual(json.loads((backup / 'container-before.json').read_text())['Config']['Env'], ['API_MASTER_KEY=kept-secret'])
                if fail == 'backup':
                    self.assertIn(['docker', 'start', 'openwa-api'], commands)
                    self.assertFalse(any('migration:run:prod' in command for command in commands))
                    self.assertFalse((root / 'nexus-version.override.json').exists())
                else:
                    override = json.loads((root / 'nexus-version.override.json').read_text())
                    self.assertEqual(override['services'][service]['image'], upgrade.IMAGE)
                    self.assertEqual(override['services'][service]['environment'], {'WWEBJS_WEB_VERSION': 'off', 'NODE_ID': 'old-node-id'})
                    self.assertTrue(any('migration:run:prod' in command for command in commands))
                    self.assertNotIn(['docker', 'start', 'openwa-api'], commands)
                    if fail:
                        self.assertTrue(any(command[-2:] == ['stop', service] for command in commands))
                    else:
                        launch = next(command for command in commands if 'up' in command)
                        self.assertEqual(launch[-1], service)
                        self.assertIn('--no-deps', launch)
                        self.assertIn('--no-build', launch)
                        self.assertIn('--wait', launch)
            finally:
                os.umask(previous_umask)

    def test_upgrade_preserves_config_volumes_and_backs_up_before_migration(self):
        self.scenario()

    def test_different_volumes_abort_before_stopping(self):
        self.scenario(wrong_mount=True)

    def test_different_database_configuration_aborts_before_stopping(self):
        self.scenario(wrong_environment=True)

    def test_service_alias_is_detected_from_container_labels(self):
        self.scenario(service='openwa')

    def test_relative_paths_and_whitespace_are_normalized(self):
        self.scenario(relative_files=True)

    def test_extra_compose_file_is_not_silently_ignored(self):
        self.scenario(extra_file=True)

    def test_service_must_still_target_the_openwa_container(self):
        self.scenario(wrong_container=True)

    def test_backup_failure_restarts_old_container_without_new_browser(self):
        self.scenario(fail='backup')

    def test_migration_failure_requires_backup_restore_before_downgrade(self):
        self.scenario(fail='migration')

    def test_health_failure_never_starts_old_browser_on_new_profile(self):
        self.scenario(fail='health')


if __name__ == '__main__':
    unittest.main()
