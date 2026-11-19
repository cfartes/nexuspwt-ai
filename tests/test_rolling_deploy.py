import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('rolling', Path(__file__).parents[1] / 'scripts' / 'rolling_deploy.py')
rolling = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rolling)


class RollingTests(unittest.TestCase):
    def test_assets_are_copied_from_live_container_without_using_old_image(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(rolling, 'run') as command:
                rolling.stage_assets('running-container', 'nexus-ptw-app:release-new', 'test-assets', directory)
            calls = [call.args for call in command.call_args_list]
            self.assertEqual(calls[0][:3], ('docker', 'cp', 'running-container:/app/.next/static/.'))
            self.assertIn('nexus-ptw-app:release-new', calls[1])
            self.assertFalse(any('sha256:' in argument for call in calls for argument in call))
            self.assertEqual(list(Path(directory).iterdir()), [])
    def test_command_errors_explain_failure_without_exposing_credentials(self):
        error = subprocess.CalledProcessError(1, ['docker', 'pull'], stderr='registry denied: password=secret-value https://name:private@registry.test/image')
        with patch.object(rolling.subprocess, 'run', side_effect=error):
            with self.assertRaises(ValueError) as failure:
                rolling.run('docker', 'pull', 'nginx:1.28-alpine')
        message = str(failure.exception)
        self.assertIn('docker pull', message)
        self.assertIn('registry denied', message)
        self.assertNotIn('secret-value', message)
        self.assertNotIn('private', message)

    def test_runtime_secrets_are_removed_from_command_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = 'runtime-private-key-123'
            rolling.RollingDeployment(Path(directory), [], {'services': {'app': {'environment': {'INTEGRATIONS_ENCRYPTION_KEY': secret}}}})
            error = subprocess.CalledProcessError(1, [], stderr='failed ' + secret)
            self.assertNotIn(secret, str(rolling.command_error(['docker', 'compose'], error)))
    def test_candidate_has_no_database_service_or_public_router(self):
        base = {
            'services': {name: {'image': name, 'build': {}, 'labels': {'traefik.enable': 'true'}, 'depends_on': {'database': {}}, 'networks': ['database']} for name in ('app', 'notifications')},
            'networks': {'traefik': {'name': 'existing-proxy'}},
        }
        original = copy.deepcopy(base)
        config = rolling.candidate_config(base, 'nexus-ptw-r123', {'app': 'sha256:app', 'notifications': 'sha256:worker'}, 'existing_database')
        self.assertEqual(base, original)
        self.assertEqual(set(config['services']), {'app', 'notifications'})
        self.assertEqual(config['networks']['database'], {'external': True, 'name': 'existing_database'})
        self.assertEqual(config['services']['app']['labels'], {'traefik.enable': 'false'})
        self.assertNotIn('build', config['services']['app'])
        self.assertNotIn('ports', config['services']['app'])

    def test_gateway_keeps_assets_and_does_not_buffer_requests(self):
        config = rolling.gateway_config('nexus-ptw-r123-app')
        self.assertIn('resolve;', config)
        self.assertIn('alias /srv/static/', config)
        self.assertIn('proxy_buffering off', config)
        with self.assertRaises(ValueError):
            rolling.gateway_config('other; arbitrary config')

    def test_legacy_rollback_reloads_gateway_without_stopping_it(self):
        with tempfile.TemporaryDirectory() as directory:
            deployment = rolling.RollingDeployment(Path(directory), [], {})
            with patch.object(deployment, 'edge', return_value='running') as edge:
                deployment.switch({'project': 'nexus-ptw', 'legacy': True, 'upstream': 'nexus-ptw-app-1'})
            self.assertIn('nexus-ptw-app-1:3000', (deployment.gateway_dir / 'active.conf').read_text())
            self.assertNotIn(('stop', 'gateway'), [call.args for call in edge.call_args_list])
            self.assertIn(('exec', '-T', 'gateway', 'nginx', '-s', 'reload'), [call.args for call in edge.call_args_list])

    def test_recovery_restores_app_and_worker_before_removing_failed_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            deployment = rolling.RollingDeployment(Path(directory), [], {})
            old, new = {'project': 'old'}, {'project': 'new'}
            deployment.state = {'active': old, 'pending': new}
            events = []
            with patch.object(deployment, 'target', side_effect=lambda target, *args: events.append((target['project'], *args))), patch.object(deployment, 'switch', side_effect=lambda target: events.append(('route', target['project']))):
                deployment.restore()
            self.assertEqual(events, [('new', 'stop', 'notifications'), ('old', 'start', 'app', 'notifications'), ('route', 'old'), ('new', 'stop', 'app')])
            self.assertIsNone(json.loads(deployment.state_path.read_text())['pending'])


if __name__ == '__main__':
    unittest.main()
