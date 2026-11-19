import json,html,shutil
from pathlib import Path
base=Path('/Users/brianeichenberger/.codex/skills/stage-plot/assets')
d=json.loads((base/'example-stage.json').read_text())
e=html.escape
parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" width="1200" height="760" role="img" aria-labelledby="title desc">','<title id="title">Fictional trio stage plot, format example</title>','<desc id="desc">Audience at bottom, stage right on page left. Acoustic and vocal downstage right, keyboard and vocal stage left, percussion upstage center. Six inputs, two monitor mixes and three output feeds.</desc>','<rect width="1200" height="760" fill="white"/>','<g font-family="Arial, Helvetica, sans-serif" fill="#171717">']
def text(x,y,t,size=16,anchor='start',weight='normal'):
 parts.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}">{e(t)}</text>')
text(40,42,'FICTIONAL TRIO / STAGE PLOT',26,weight='bold')
text(40,70,'FORMAT EXAMPLE - not The Swell - illustrative dimensions - 2026-09-29',16)
text(40,108,'STAGE RIGHT / audience left',15,weight='bold')
text(760,108,'STAGE LEFT / audience right',15,'end','bold')
parts.append('<rect x="40" y="130" width="720" height="480" fill="#fafafa" stroke="#171717" stroke-width="2"/>')
text(400,152,'UPSTAGE / BACK',13,'middle')
for z in d['zones']:
 x,y,w,h=40+z['x']*30,130+z['y']*30,z['width']*30,z['depth']*30
 parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#aaa" stroke-dasharray="5 4"/>')
 text(x+6,y+18,z['performer'].split(' - ')[0]+' / '+z['depth_band'],13,weight='bold')
for i,n in enumerate(d['nodes'],1):
 x,y,w,h=40+n['x']*30,130+n['y']*30,n['width']*30,n['depth']*30
 fill='#e5e5e5'
 if n['kind']=='drums':
  parts.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="#333"/>')
 elif n['kind']=='mic':
  parts.append(f'<path d="M{x+w/2},{y} V{y+h} M{x},{y+h} H{x+w}" fill="none" stroke="#333" stroke-width="2"/>')
 elif n['kind']=='wedge':
  parts.append(f'<path d="M{x},{y+h} L{x+w*.2},{y} H{x+w*.8} L{x+w},{y+h} Z" fill="{fill}" stroke="#333"/>')
 else:
  parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#333"/>')
 if n['kind']=='keyboard':
  for j in range(1,12):
   xx=x+w*j/12
   parts.append(f'<path d="M{xx},{y+h*.45} V{y+h}" stroke="#777"/>')
 bx,by=x+w+7,y+3
 parts.append(f'<circle cx="{bx}" cy="{by}" r="10" fill="white" stroke="#333"/>')
 text(bx,by+4,str(i),12,'middle','bold')
text(400,592,'DOWNSTAGE / FRONT',13,'middle')
text(400,639,'AUDIENCE',20,'middle','bold')
text(400,662,'24 ft wide x 16 ft deep - illustrative, not a confirmed minimum',14,'middle')
text(810,142,'NUMBERED EQUIPMENT KEY',16,weight='bold')
for i,n in enumerate(d['nodes'],1):
 ch=[str(r['channel']) for r in d['inputs'] if r['node_id']==n['id']]
 suffix=' | CH '+','.join(ch) if ch else ''
 text(810,174+(i-1)*23,f'{i:02}  {n["label"]}{suffix}',14)
text(810,500,'M1: mono / Aux 1 / two wedges',14,weight='bold')
text(810,524,'M2: stereo IEM / Aux 2 L + Aux 3 R',14,weight='bold')
text(810,557,'P1 / P2: proposed 120 V, 60 Hz',14)
text(810,579,'Outlet and load details: see companion list',14)
text(40,710,'Badges identify equipment; CH identifies console inputs; M identifies monitor mix; P identifies power.',14)
text(40,735,'Contact: unassigned example contact. Verify all equipment, dimensions and power before use.',14)
parts.append('</g></svg>')
(base/'example-stage.svg').write_text('\n'.join(parts)+'\n')
md=['# Fictional trio — format example','\nThis is an original teaching example, not The Swell’s requirements. Revision: 2026-09-29. All technical selections remain proposed. Geometry is illustrative.','\n```text\n                         UPSTAGE / BACK\nSTAGE RIGHT                                             STAGE LEFT\n(audience left)                                         (audience right)\n                    Morgan: percussion / M2\n                    stereo IEM / P2\n                                           Taylor: keys + vocal\n                                           stereo DI / P1 / M1\n      Alex: acoustic + vocal\n      DI / M1\n                        DOWNSTAGE / FRONT\n                             AUDIENCE\n```','\nThe SVG shows dimensions and placements from the JSON. This ASCII map preserves relative grouping, not measured scale. Numbered badges in the SVG reference the equipment key, not input channels.','\n## Inputs','\n| Ch | Source | Node | Mic / DI | Stand | Phantom | Supplier |','| --- | --- | --- | --- | --- | --- | --- |']
for r in d['inputs']: md.append('| '+' | '.join(str(r[k]) for k in ('channel','source','node_id','mic_di','stand','phantom','supplier'))+' |')
md += ['\nKeys L/R occupy two channels. Inputs in this example are routed to FOH and monitors. Exact connection: balanced XLR to house console. No click or private talkback is specified.','\n## Monitors','\n| Mix | Type / mode | Recipients | Output feeds | Devices |','| --- | --- | --- | --- | --- |']
for m in d['monitors']: md.append(f"| {m['id']} | {m['type']} / {m['mode']} | {', '.join(m['zone_ids'])} | {', '.join(m['output_feeds'])} | {', '.join(m['node_ids'])} |")
md += ['\nTwo monitor mixes use three output feeds. M1 serves two physical wedges. House supplies M1 wedges and all three feeds; band supplies M2 wired IEM pack and ears.','\n## Power','\n| ID | Location | Supply proposed | Outlets | Load | Circuit |','| --- | --- | --- | --- | --- | --- |']
for p in d['power']: md.append(f"| {p['id']} | {p['node_id']} | {p['voltage']} V / {p['frequency_hz']} Hz | {p['outlets']} | unknown | {p['circuit_request']} |")
md += ['\nPower is proposed venue-supplied; the grounded US connector and exact adapter requirements need confirmation. Outlet counts do not establish independent circuits.','\n## Unresolved']+['\n- '+q for q in d['open_questions']]
md += ['\n## Editable sources','\nSee `example-stage.json` and `example-stage.svg`. No PDF is supplied for this fictional exercise; the downloaded PDFs in this folder are real-world format references.']
(base/'example-stage.md').write_text('\n'.join(md)+'\n')
out=Path('docs/live-show/examples/fictional-trio')
out.mkdir(exist_ok=True)
for name in ['example-stage.json','example-stage.svg','example-stage.md']: shutil.copy2(base/name,out/name)
print('Generated SVG and Markdown; copied fictional example to examples/fictional-trio')
