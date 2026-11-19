import sys
sys.path.insert(0,'tmp/stage-icon-cleanup-deps')
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
r=Path('output/stage-plot/performer-icons')
files={'joe':r/'joe-yellow-tele-overhead-no-glow-white.png','ike':r/'ike-blue-mustang-overhead.png','jackson':r/'jackson-green-tele-overhead.png','chris':r/'chris-red-nord-overhead.png','sam':r/'sam-white-drums-overhead.png'}
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',19)
for mode in ['color','bw']:
 for key,col in files.items():
  p=col if mode=='color' else r/'black-white'/f'{key}-overhead-bw.png'
  a=np.array(Image.open(p).convert('RGB')); white=((a.min(2)>=249)&(np.ptp(a.astype(int),axis=2)<=7)).astype('uint8')
  n,lab,stat,cent=cv2.connectedComponentsWithStats(white,8)
  border=np.unique(np.concatenate((lab[0],lab[-1],lab[:,0],lab[:,-1])));border=border[border!=0]
  bg=np.isin(lab,border);out=Image.fromarray(a);d=ImageDraw.Draw(out)
  vals=[]
  for i in range(1,n):
   if i not in border and stat[i,4]>80:
    x,y=cent[i]; d.rectangle((x-18,y-12,x+25,y+12),fill='magenta');d.text((x-15,y-12),str(i),fill='black',font=font); vals.append([i,*map(int,stat[i]),*map(int,cent[i])])
  out.resize((512,768)).save(f'tmp/stage-icon-cleanup/{key}-{mode}-regions.png')
  np.savez_compressed(f'tmp/stage-icon-cleanup/{key}-{mode}.npz',lab=lab,bg=bg)
  print(key,mode,vals)
