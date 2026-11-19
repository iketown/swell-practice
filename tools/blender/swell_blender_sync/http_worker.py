"""Isolated network worker. Never imports bpy and never follows redirects."""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

for line in sys.stdin:
    try:
        if len(line) > 300000:
            raise ValueError("Request too large")
        message = json.loads(line)
        base = urllib.parse.urlsplit(message['appUrl'])
        if base.username or base.password or base.query or base.fragment or base.path not in ('', '/'):
            raise ValueError('Use the website origin without a path')
        if base.scheme != 'https' and not (base.scheme == 'http' and base.hostname in ('localhost', '127.0.0.1', '::1')):
            raise ValueError('Use HTTPS or local development')
        url = message['appUrl'].rstrip('/') + '/api/setups/' + urllib.parse.quote(message['setupId'], safe='') + '/blender-items'
        body = json.dumps(message['body']).encode() if message.get('body') is not None else None
        req = urllib.request.Request(url, data=body, method=message['method'], headers={'Authorization': 'Swell ' + message['token'], 'Content-Type': 'application/json'})
        with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError('Response too large')
            output = {'ok': True, 'data': json.loads(raw)}
    except urllib.error.HTTPError as error:
        try:
            details = json.loads(error.read(8192)).get('error', {})
            text = details.get('message', str(error)) if isinstance(details, dict) else str(details)
        except Exception:
            text = 'Server returned HTTP ' + str(error.code)
        output = {'ok': False, 'status': error.code, 'error': text}
    except Exception as error:
        output = {'ok': False, 'status': 0, 'error': str(error)}
    sys.stdout.write(json.dumps(output) + '\n')
    sys.stdout.flush()
