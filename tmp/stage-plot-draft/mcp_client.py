import json,urllib.request,pathlib,sys
session=json.loads(pathlib.Path('/tmp/swell-illustrator-mcp-session.json').read_text())
def call(name,args={}):
 body={'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':name,'arguments':args}}
 r=urllib.request.urlopen(urllib.request.Request(session['url'],data=json.dumps(body).encode(),headers=session['headers']),timeout=90)
 raw=r.read().decode(); result=json.loads(next((s[6:] for s in raw.splitlines() if s.startswith('data: ')),raw))
 return result
if __name__=='__main__':print(json.dumps(call(sys.argv[1],json.loads(sys.argv[2]) if len(sys.argv)>2 else {}),indent=2))
