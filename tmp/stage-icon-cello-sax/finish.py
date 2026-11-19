from pathlib import Path
source=Path('tmp/stage-icon-acoustic/finish.py').read_text()
jobs=[('cello','exec-43728165-5140-4899-8dba-55c3503d02af.png','[1,2,12,13]'),('alto-saxophone','exec-fc7f9780-b8ec-459b-9867-4e72cdf76697.png','[1]')]
for name,file,components in jobs:
    code=source.replace('exec-546d5802-c8a5-4f2c-a3fe-c5d4c6995944.png',file).replace('[1,229,230,239]',components).replace('acoustic-guitar-on-stand',name+'-on-stand').replace('tmp/stage-icon-acoustic/transparency-proof.jpg','tmp/stage-icon-cello-sax/'+name+'-proof.jpg')
    exec(compile(code,name,'exec'))
