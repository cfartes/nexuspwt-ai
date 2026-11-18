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
