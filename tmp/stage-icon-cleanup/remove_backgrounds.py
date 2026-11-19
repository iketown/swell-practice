import sys,json
sys.path.insert(0,'tmp/stage-icon-cleanup-deps')
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
r=Path('output/stage-plot/performer-icons'); dest=r/'transparent'
files={'joe':'joe-yellow-tele-overhead-no-glow-white.png','ike':'ike-blue-mustang-overhead.png','jackson':'jackson-green-tele-overhead.png','chris':'chris-red-nord-overhead.png','sam':'sam-white-drums-overhead.png'}
holes={'color':{'joe':[14,15],'ike':[4,6],'jackson':[11,12],'chris':[8,9,22,257],'sam':[31,33,94]},'bw':{'joe':[236,269],'ike':[291,315],'jackson':[363,391],'chris':[547,561,738,961],'sam':[188,192,492,497,655,674]}}
proof=Image.new('RGB',(1500,960),'#253240'); d=ImageDraw.Draw(proof);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
report=[]
for row,mode in enumerate(['color','bw']):
 (dest/mode).mkdir(parents=True,exist_ok=True)
 for col,(key,file) in enumerate(files.items()):
  p=r/file if mode=='color' else r/'black-white'/f'{key}-overhead-bw.png'
  rgb=np.array(Image.open(p).convert('RGB')).astype(float)
  z=np.load(f'tmp/stage-icon-cleanup/{key}-{mode}.npz'); bg=z['bg']|np.isin(z['lab'],holes[mode][key])
  # Clean near-white slivers trapped between hair spikes, without touching interior gray streaks.
  hair_bottom={'joe':480,'ike':420,'jackson':460,'chris':370,'sam':400}[key]
  neutral=(rgb.min(2)>218)&((rgb.max(2)-rgb.min(2))<14)
  neutral[hair_bottom:]=False
  if key=='sam':
   neutral[:,:365]=False; neutral[:,645:]=False; neutral[390:]=False
  near_bg=cv2.distanceTransform((~bg).astype('uint8'),cv2.DIST_L2,5)
  cn,cl,cs,_=cv2.connectedComponentsWithStats(neutral.astype('uint8'),8)
  for ci in range(1,cn):
   reg=cl==ci
   if np.any(reg & bg):
    # Only the hair-area background component, not enclosed white foreground details.
    bg[reg]=True
   elif cs[ci,4]<1500 and near_bg[reg].max()<12:
    bg[reg]=True
  fg=(~bg).astype('uint8')
  count,labels,stats,_=cv2.connectedComponentsWithStats(fg,8)
  for i in range(1,count):
   if stats[i,4]<12: fg[labels==i]=0
  # Derive antialias alpha only in a narrow silhouette boundary, removing white matte contamination.
  inside=cv2.erode(fg,np.ones((3,3),np.uint8),iterations=2)
  dist,nearest=cv2.distanceTransformWithLabels(1-inside,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
  y,x=np.where(inside>0); lookup=np.zeros((len(y)+1,3));lookup[1:]=rgb[y,x]
  ref=lookup[nearest]; band=(fg>0)&(inside==0)
  denom=255-ref;chan=np.argmax(denom,axis=2);den=np.take_along_axis(denom,chan[:,:,None],axis=2)[:,:,0]
  obs=np.take_along_axis(255-rgb,chan[:,:,None],axis=2)[:,:,0]
  alpha=fg.astype(float); estimate=np.clip(obs/np.maximum(den,1),0,1)
  alpha[band & (den>20)]=estimate[band & (den>20)]
  clean=rgb.copy();valid=band&(alpha>0.005)
  clean[valid]=np.clip((rgb[valid]-255*(1-alpha[valid,None]))/alpha[valid,None],0,255)
  clean[alpha==0]=0
  if mode=='bw':
   gray=np.round(clean@np.array([0.2126,0.7152,0.0722]));clean=np.repeat(gray[:,:,None],3,2)
  rgba=np.dstack([np.round(clean).astype('uint8'),np.round(alpha*255).astype('uint8')]);im=Image.fromarray(rgba)
  out=dest/mode/f'{key}-{mode}-transparent.png'; im.save(out)
  small=im.copy();small.thumbnail((290,435),Image.Resampling.LANCZOS);proof.paste(small,(col*300+(300-small.width)//2,row*480+35),small)
  d.text((col*300+12,row*480+8),f'{key.title()} / {mode}',font=font,fill='white')
  report.append({'file':str(out),'size':im.size,'transparent_pixels':int((rgba[:,:,3]==0).sum()),'opaque_pixels':int((rgba[:,:,3]==255).sum()),'partial_pixels':int(((rgba[:,:,3]>0)&(rgba[:,:,3]<255)).sum())})
proof.save(dest/'transparency-proof-dark.jpg',quality=94)
(dest/'checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
