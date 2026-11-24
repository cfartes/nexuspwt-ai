import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_vps', Path(__file__).resolve().parents[1] / 'scripts' / 'deploy_vps.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class InstallTests(unittest.TestCase):
    def test_generated_admin_password_meets_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = root / 'deploy' / '.env.production'
            env.parent.mkdir()
            previous_umask = os.umask(0o077)
            try:
                with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'ENV', env), patch.object(deploy, 'routing', return_value={}), patch.object(deploy, 'choose', return_value='admin@example.com'), patch.object(deploy, 'output', return_value='release'), patch.object(deploy.secrets, 'token_urlsafe', return_value='a' * 24), patch.object(deploy.subprocess, 'run'):
                    deploy.main()
                password = deploy.load_env(env)['BOOTSTRAP_PASSWORD']
                self.assertGreaterEqual(len(password), 8)
                self.assertRegex(password, r'[A-Z]')
                self.assertIn('!', password)
            finally:
                os.umask(previous_umask)

    def test_update_preserves_environment_and_never_recreates_database(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = root / 'deploy' / '.env.production'
            env.parent.mkdir()
            original = 'POSTGRES_PASSWORD=keep-password\nDATABASE_URL=postgresql://nexus:keep-password@database:5432/nexus\nINTEGRATIONS_ENCRYPTION_KEY=' + 'b' * 64 + '\nBOOTSTRAP_EMAIL=admin@example.com\nBOOTSTRAP_PASSWORD=keep-admin-password\n'
            env.write_text(original)
            previous_umask = os.umask(0o077)
            try:
                with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'ENV', env), patch.object(deploy, 'routing', side_effect=AssertionError('Não redetectar Traefik')), patch.object(deploy, 'output', side_effect=['database-id', json.dumps([{'Mounts': [{'Type': 'volume', 'Destination': '/var/lib/postgresql/data'}]}]), 't']), patch.object(deploy.subprocess, 'run') as run:
                    deploy.main(update_only=True)
                self.assertEqual(env.read_text(), original)
                commands = [call.args[0] for call in run.call_args_list]
                self.assertFalse(any(command[-1] == 'database' and 'up' in command for command in commands))
                self.assertFalse(any('down' in command or 'prune' in command or '--volumes' in command for command in commands))
                migration = next(i for i, command in enumerate(commands) if command[-1] == 'bootstrap')
                self.assertIn('--no-deps', commands[migration])
                self.assertIn('BOOTSTRAP_EMAIL=', commands[migration])
                self.assertIn('BOOTSTRAP_PASSWORD=', commands[migration])
                self.assertIn('--no-deps', commands[migration + 1])
                self.assertTrue(any('pg_dump' in command for command in commands[:migration]))
            finally:
                os.umask(previous_umask)

    def test_update_refuses_missing_environment_or_database_before_build(self):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / '.env.production'
            previous_umask = os.umask(0o077)
            try:
                with patch.object(deploy, 'ENV', env), patch.object(deploy, 'routing') as routing, patch.object(deploy.subprocess, 'run') as run:
                    with self.assertRaises(ValueError):
                        deploy.main(update_only=True)
                    routing.assert_not_called()
                    run.assert_not_called()
                env.write_text('POSTGRES_PASSWORD=keep\nDATABASE_URL=postgresql://nexus:keep@database/nexus\nINTEGRATIONS_ENCRYPTION_KEY=keep\nBOOTSTRAP_EMAIL=admin@example.com\nBOOTSTRAP_PASSWORD=keep\n')
                with patch.object(deploy, 'ENV', env), patch.object(deploy, 'output', return_value=''), patch.object(deploy.subprocess, 'run') as run:
                    with self.assertRaises(ValueError):
                        deploy.main(update_only=True)
                    self.assertEqual(len(run.call_args_list), 1)
                    self.assertEqual(run.call_args.args[0][-2:], ['config', '--quiet'])
            finally:
                os.umask(previous_umask)

    def test_routing_uses_existing_proxy_network_and_tls(self):
        containers = [
            {'Name': '/traefik', 'Config': {'Image': 'traefik:v3', 'Cmd': ['--entrypoints.websecure.address=:443', '--certificatesresolvers.letsencrypt.acme.email=admin@example.com']}, 'NetworkSettings': {'Networks': {'proxy': {}}}},
            {'Name': '/rotafy', 'Config': {'Image': 'rotafy', 'Labels': {'traefik.http.routers.rotafy.tls.certresolver': 'letsencrypt', 'traefik.http.routers.rotafy.entrypoints': 'websecure'}}, 'NetworkSettings': {'Networks': {'proxy': {}}}},
        ]
        with patch.dict(os.environ, {}, clear=True), patch.object(deploy, 'output', side_effect=['one two', json.dumps(containers), json.dumps([{'Driver': 'bridge', 'Internal': False}])]):
            self.assertEqual(deploy.routing({}), dict(TRAEFIK_NETWORK='proxy', TRAEFIK_HTTPS_ENTRYPOINT='websecure', TRAEFIK_CERTRESOLVER='letsencrypt'))

    def test_existing_credentials_preserved_and_migration_precedes_workers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = root / 'deploy' / '.env.production'
            env.parent.mkdir()
            original = dict(POSTGRES_PASSWORD='a' * 64, DATABASE_URL='postgresql://nexus:abc@database:5432/nexus', INTEGRATIONS_ENCRYPTION_KEY='b' * 64, BOOTSTRAP_EMAIL='admin@example.com', BOOTSTRAP_PASSWORD='preserve-this-password')
            env.write_text(''.join(f'{k}={v}\n' for k, v in original.items()))
            routing = dict(TRAEFIK_NETWORK='proxy', TRAEFIK_HTTPS_ENTRYPOINT='websecure', TRAEFIK_CERTRESOLVER='letsencrypt')
            previous_umask = os.umask(0o077)
            try:
                with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'ENV', env), patch.object(deploy, 'routing', return_value=routing), patch.object(deploy.subprocess, 'run') as run:
                    deploy.main()
                saved = deploy.load_env(env)
                for key, value in original.items():
                    self.assertEqual(saved[key], value)
                self.assertEqual(saved['APP_URL'], 'https://nexusptw.nexusdataanalytics.tech')
                commands = [call.args[0] for call in run.call_args_list]
                migration = next(i for i, command in enumerate(commands) if command[-1] == 'bootstrap')
                self.assertEqual(commands[migration + 1][-5:], ['up', '-d', '--wait', 'app', 'notifications'])
                self.assertTrue(any('pg_dump' in command for command in commands[:migration]))
                self.assertFalse(any('down' in command or 'prune' in command for command in commands))
            finally:
                os.umask(previous_umask)

    def test_ambiguous_detection_requires_explicit_choice_without_terminal(self):
        with patch.object(deploy.sys.stdin, 'isatty', return_value=False):
            with self.assertRaises(ValueError):
                deploy.choose('TRAEFIK_NETWORK', ['one', 'two'])
        self.assertEqual(deploy.choose('TRAEFIK_NETWORK', ['one', 'two'], 'two'), 'two')

    def test_env_rejects_compose_expansion(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env'
            path.write_text('BOOTSTRAP_PASSWORD=$SECRET\n')
            with self.assertRaises(ValueError):
                deploy.load_env(path)


if __name__ == '__main__':
    unittest.main()
