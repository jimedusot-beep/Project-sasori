import http.client
import json
from pathlib import Path
import sys
import threading
import tempfile
import os
import stat
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sasori_hub import Companion, HubServer, read_private_config
from tv_protocol import HADevice, HomeAssistant, HubError, NoRedirect, RokuDevice, TransportError, private_ipv4


XML = b'<device-info><vendor-name>Roku</vendor-name><model-name>Fixture TV</model-name><software-version>15.0</software-version><is-tv>true</is-tv><serial-number>private-radio-secret</serial-number><user-device-name>Fixture</user-device-name><power-mode>PowerOn</power-mode></device-info>'


class Transport:
    def __init__(self):
        self.calls = []
        self.xml = XML
        self.error = None
        self.features = 1 | 4 | 8 | 16 | 32 | 128 | 256 | 16384
        self.state = 'playing'

    def request(self, method, url, **options):
        self.calls.append((method, url, options))
        if self.error:
            raise TransportError(self.error)
        if '/query/device-info' in url:
            return self.xml
        if url.endswith('/api/'):
            return b'{"message":"API running."}'
        if url.endswith('/api/states'):
            return json.dumps([{'entity_id': 'media_player.fixture', 'attributes': {'friendly_name': 'Fixture TV'}},
                {'entity_id': 'remote.fixture', 'attributes': {'friendly_name': 'Fixture IR'}},
                {'entity_id': 'lock.excluded', 'attributes': {'friendly_name': 'Excluded'}}]).encode()
        if '/api/states/' in url:
            entity = url.rsplit('/', 1)[-1]
            return json.dumps({'entity_id': entity, 'state': self.state, 'attributes': {
                'supported_features': self.features, 'is_volume_muted': False,
                'friendly_name': 'Fixture TV'}}).encode()
        return b'[]'


class ProtocolTests(unittest.TestCase):
    def test_private_hosts_reject_public_metadata_loopback_and_url_injection(self):
        self.assertEqual(private_ipv4('192.168.1.20'), '192.168.1.20')
        for value in ['127.0.0.1', '169.254.169.254', '8.8.8.8', '192.168.1.20:8060', 'http://192.168.1.20', '10.1.1.1/path', '999.1.1.1', None]:
            with self.assertRaises(HubError):
                private_ipv4(value)

    def test_roku_connect_only_reads_metadata_and_omits_identifiers(self):
        transport = Transport()
        tv = RokuDevice('192.168.1.20', transport)
        result = tv.read()
        self.assertEqual([call[0] for call in transport.calls], ['GET'])
        self.assertNotIn('private-radio-secret', json.dumps(result))
        self.assertIn('volume-up', result['keys'])
        self.assertNotIn('power-on', result['keys'])

    def test_roku_buttons_have_fixed_paths_and_absent_capabilities_stay_disabled(self):
        transport = Transport()
        transport.xml = XML.replace(b'<is-tv>true</is-tv>', b'<is-tv>false</is-tv>')
        tv = RokuDevice('192.168.1.20', transport)
        tv.read()
        with self.assertRaises(HubError):
            tv.send('volume-up')
        for value in ['Lit_password', '../../reboot', 'firmware', 'Search', 'power-on']:
            with self.assertRaises(HubError):
                tv.send(value)
        tv.send('home')
        self.assertEqual(transport.calls[-1][0:2], ('POST', 'http://192.168.1.20:8060/keypress/Home'))

    def test_new_roku_player_flags_enable_only_reported_volume_and_power_support(self):
        transport = Transport()
        transport.xml = XML.replace(b'<is-tv>true</is-tv>', b'<is-tv>false</is-tv><supports-audio-volume-control>true</supports-audio-volume-control><supports-tv-power-control>true</supports-tv-power-control>')
        result = RokuDevice('192.168.1.20', transport).read()
        self.assertIn('volume-up', result['keys'])
        self.assertIn('power-off', result['keys'])

    def test_malformed_foreign_and_entity_xml_is_refused(self):
        for body in [b'not xml', XML.replace(b'Roku', b'Other'), b'<!DOCTYPE x [<!ENTITY y "boom">]><device-info/>']:
            transport = Transport()
            transport.xml = body
            with self.assertRaises(HubError):
                RokuDevice('192.168.1.20', transport).read()

    def test_roku_rejection_is_a_fixed_actionable_error(self):
        transport = Transport()
        tv = RokuDevice('192.168.1.20', transport)
        tv.read()
        transport.error = 403
        with self.assertRaises(HubError) as error:
            tv.send('home')
        self.assertEqual(error.exception.code, 'tv-control-disabled')

    def test_home_assistant_token_and_service_mapping_remain_private_and_scoped(self):
        transport = Transport()
        ha = HomeAssistant('http://192.168.1.10:8123', 'synthetic-private-token-only', transport)
        tv = HADevice(ha, 'media_player.fixture')
        result = tv.read()
        self.assertNotIn('synthetic-private-token-only', json.dumps(result))
        tv.send('mute')
        method, url, options = transport.calls[-1]
        self.assertEqual(method, 'POST')
        self.assertEqual(url, 'http://192.168.1.10:8123/api/services/media_player/volume_mute')
        self.assertEqual(options['payload'], {'entity_id': 'media_player.fixture', 'is_volume_muted': True})
        self.assertEqual(options['headers']['Authorization'], 'Bearer synthetic-private-token-only')
        with self.assertRaises(HubError):
            HADevice(ha, 'lock.excluded').read()

    def test_home_assistant_features_and_unavailable_state_disable_controls(self):
        transport = Transport()
        ha = HomeAssistant('http://192.168.1.10:8123', 'synthetic-private-token-only', transport)
        tv = HADevice(ha, 'media_player.fixture')
        transport.features = 4
        self.assertEqual(tv.read()['keys'], ['volume-up', 'volume-down'])
        with self.assertRaises(HubError):
            tv.send('power-off')
        transport.state = 'unavailable'
        self.assertEqual(tv.read()['keys'], [])

    def test_ir_learning_only_requests_ir_and_uses_a_fixed_semantic_button(self):
        transport = Transport()
        ha = HomeAssistant('http://192.168.1.10:8123', 'synthetic-private-token-only', transport)
        ir = HADevice(ha, 'remote.fixture', remote=True, device='fixture-tv')
        ir.learn('volume-down')
        payload = transport.calls[-1][2]['payload']
        self.assertEqual(payload['command_type'], 'ir')
        self.assertEqual(payload['command'], ['volume-down'])
        self.assertEqual(payload['device'], 'fixture-tv')
        with self.assertRaises(HubError):
            ir.learn('rf-unlock')
        transport.state = 'unavailable'
        self.assertFalse(ir.read()['learnAvailable'])

    def test_home_assistant_only_lists_media_and_remote_entities(self):
        ha = HomeAssistant('http://192.168.1.10:8123', 'synthetic-private-token-only', Transport())
        self.assertEqual([value['id'] for value in ha.entities()], ['media_player.fixture', 'remote.fixture'])

    def test_public_ha_urls_credentials_and_redirects_are_rejected(self):
        for url in ['https://example.com', 'http://169.254.169.254', 'http://user:pass@192.168.1.10:8123', 'http://192.168.1.10/?token=private']:
            with self.assertRaises(HubError):
                HomeAssistant(url, 'synthetic-private-token-only', Transport())
        with self.assertRaises(HubError):
            HomeAssistant('http://192.168.1.10', 'header\nprivate-value', Transport())
        with self.assertRaises(TransportError):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.com')

    def test_optional_configuration_is_private_explicit_and_removed_when_remember_is_unchecked(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'private' / 'companion.json'
            app = Companion(transport=Transport(), pin='000000', config_path=path)
            app.configure({'url': 'http://192.168.1.10:8123', 'token': 'synthetic-private-token-only', 'remember': True})
            self.assertTrue(path.is_file())
            self.assertEqual(read_private_config(path)['token'], 'synthetic-private-token-only')
            if os.name != 'nt':
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
                os.chmod(path, 0o644)
                with self.assertRaises(HubError):
                    read_private_config(path)
                os.chmod(path, 0o600)
            app.configure({'url': 'http://192.168.1.10:8123', 'token': 'synthetic-private-token-only', 'remember': False})
            self.assertFalse(path.exists())


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.now = [0]
        self.transport = Transport()
        self.app = Companion(transport=self.transport, pin='000000', clock=lambda: self.now[0])
        self.server = HubServer(('127.0.0.1', 0), self.app)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port
        self.cookie = ''
        self.csrf = ''

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, path, data=None, *, headers=None, method=None):
        client = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        values = {'X-Sasori-Client': 'hub-v1', 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:%d' % self.port}
        if self.cookie:
            values['Cookie'] = self.cookie
        if self.csrf:
            values['X-Sasori-CSRF'] = self.csrf
        values.update(headers or {})
        client.request(method or ('POST' if data is not None else 'GET'), path,
            body=None if data is None else json.dumps(data), headers=values)
        response = client.getresponse()
        body, status, response_headers = response.read(), response.status, dict(response.getheaders())
        client.close()
        return status, body, response_headers

    def pair(self):
        status, _, headers = self.request('/api/pair', {'pin': '000000'})
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        status, body, _ = self.request('/api/bootstrap')
        self.csrf = json.loads(body)['csrf']
        return headers

    def connect(self):
        status, body, _ = self.request('/api/tv/connect', {'driver': 'roku', 'target': '192.168.1.20'})
        self.assertEqual(status, 200)
        return json.loads(body)['lease']

    def test_pairing_is_required_and_cookie_is_httponly_strict(self):
        self.assertEqual(self.request('/api/tv/entities')[0], 401)
        headers = self.pair()
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        self.assertEqual(self.request('/api/tv/entities')[0], 200)

    def test_csrf_cross_origin_and_host_checks_block_requests_before_any_device_access(self):
        self.pair()
        body = {'driver': 'roku', 'target': '192.168.1.20'}
        self.assertEqual(self.request('/api/tv/connect', body, headers={'X-Sasori-CSRF': ''})[0], 403)
        self.assertEqual(self.request('/api/tv/connect', body, headers={'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request('/api/tv/connect', body, headers={'Host': 'example.com:%d' % self.port})[0], 403)
        self.assertEqual(self.transport.calls, [])

    def test_metadata_connection_is_read_only_and_keys_need_a_current_lease(self):
        self.pair()
        lease = self.connect()
        self.assertEqual(len(self.transport.calls), 1)
        self.assertEqual(self.transport.calls[0][0], 'GET')
        self.assertEqual(self.request('/api/tv/key', {'lease': 'wrong', 'key': 'home'})[0], 409)
        status, body, _ = self.request('/api/tv/key', {'lease': lease, 'key': 'home'})
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)['physicalEffectVerified'])
        self.request('/api/tv/disconnect', {'lease': lease})
        self.assertEqual(self.request('/api/tv/key', {'lease': lease, 'key': 'home'})[0], 409)

    def test_expired_leases_and_old_connections_cannot_send_commands(self):
        self.pair()
        old = self.connect()
        new = self.connect()
        self.assertNotEqual(old, new)
        self.assertEqual(self.request('/api/tv/key', {'lease': old, 'key': 'home'})[0], 409)
        self.now[0] = 301
        self.assertEqual(self.request('/api/tv/key', {'lease': new, 'key': 'home'})[0], 409)

    def test_pairing_brute_force_and_expired_codes_are_bounded(self):
        for _ in range(10):
            self.assertEqual(self.request('/api/pair', {'pin': '111111'})[0], 401)
        self.assertEqual(self.request('/api/pair', {'pin': '000000'})[0], 429)
        self.now[0] = 301
        self.assertEqual(self.request('/api/pair', {'pin': '000000'})[0], 429)

    def test_static_files_are_scoped_and_runtime_is_marked_only_by_the_companion(self):
        status, body, headers = self.request('/hub.html')
        self.assertEqual(status, 200)
        self.assertIn(b'name="sasori-runtime" content="local-helper"', body)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/%2e%2e/desktop/sasori_hub.py')[0], 404)
        self.assertEqual(self.request('/.env')[0], 404)
        self.assertEqual(self.request('/api/tv/key', method='OPTIONS')[0], 403)

    def test_public_targets_unknown_drivers_and_raw_commands_are_refused(self):
        self.pair()
        self.assertEqual(self.request('/api/tv/connect', {'driver': 'roku', 'target': '169.254.169.254'})[0], 400)
        self.assertEqual(self.request('/api/tv/connect', {'driver': 'raw', 'target': '192.168.1.20'})[0], 400)
        lease = self.connect()
        self.assertEqual(self.request('/api/tv/key', {'lease': lease, 'key': 'Lit_private-token'})[0], 400)

    def test_local_configuration_requires_pairing_and_csrf_and_invalidates_existing_leases(self):
        config = {'url': 'http://192.168.1.10:8123', 'token': 'synthetic-private-token-only', 'remember': False}
        self.assertEqual(self.request('/api/ha/configure', config)[0], 401)
        self.pair()
        old = self.connect()
        self.assertEqual(self.request('/api/ha/configure', config, headers={'X-Sasori-CSRF': ''})[0], 403)
        status, body, _ = self.request('/api/ha/configure', config)
        self.assertEqual(status, 200)
        self.assertNotIn(b'synthetic-private-token-only', body)
        _, bootstrap, _ = self.request('/api/bootstrap')
        self.assertTrue(json.loads(bootstrap)['homeAssistant'])
        self.assertNotIn(b'synthetic-private-token-only', bootstrap)
        self.assertEqual(self.request('/api/tv/key', {'lease': old, 'key': 'home'})[0], 409)


if __name__ == '__main__':
    unittest.main()
