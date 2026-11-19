from pathlib import Path
from xml.etree import ElementTree as ET
import re
NS='http://www.w3.org/2000/svg';ET.register_namespace('',NS)
tree=ET.parse('tmp/stage-icon-svg/sam-stand-traced.svg');root=tree.getroot()
root.set('width','1296');root.set('height','1024');root.set('viewBox','0 0 1296 1024')
root.set('role','img');root.set('aria-labelledby','title description')
title=ET.Element('{'+NS+'}title',{'id':'title'});title.text='Sam side boom microphone stand — shorter arm'
desc=ET.Element('{'+NS+'}desc',{'id':'description'});desc.text='Editable vector paths with transparent background. Tripod on the left; boom reaches right to a microphone at ninety degrees. Straight boom shortened by 240 drawing units, approximately 20 percent, without scaling the microphone or tripod.'
root.insert(0,title);root.insert(1,desc)
for idx,p in enumerate(root.findall('{'+NS+'}path')):
 tx,ty=map(float,re.search(r'translate\(([^)]+)\)',p.attrib.pop('transform')).group(1).split(','))
 tokens=re.findall(r'[MCZ]|[-+]?(?:\d*\.\d+|\d+)',p.attrib['d']);out=[];i=0
 while i<len(tokens):
  if tokens[i] in ['M','C','Z']:out.append(tokens[i]);i+=1;continue
  x,y=float(tokens[i])+tx,float(tokens[i+1])+ty
  if y<350:x-=240*max(0,min(1,(x-350)/650))
  out.append(f'{x:.2f} {y:.2f}');i+=2
 p.set('d',' '.join(out));p.set('id',f'stand-path-{idx+1:02d}')
 # Enforce neutral-gray fills for consistent monochrome printing.
 color=p.get('fill');r,g,b=[int(color[i:i+2],16) for i in (1,3,5)];v=round(.2126*r+.7152*g+.0722*b);p.set('fill',f'#{v:02x}{v:02x}{v:02x}')
out=Path('output/stage-plot/performer-icons/transparent/the-swell-stage-icons-transparent/hybrid/sam-side-boom-shorter.svg')
tree.write(out,encoding='utf-8',xml_declaration=True)
assert len(root.findall('{'+NS+'}path'))==39
assert not root.findall('.//{'+NS+'}image')
print(out)
