import sys,json
sys.path.insert(0,'tmp/stage-icon-cleanup-deps')
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageOps
from pathlib import Path
r=Path('output/stage-plot/performer-icons/transparent')
dest=r/'the-swell-stage-icons-transparent'/'hybrid';dest.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
proof=Image.new('RGB',(1500,980),'white');d=ImageDraw.Draw(proof)
dark=Image.new('RGB',(1500,490),'#253240');dd=ImageDraw.Draw(dark)
reports=[]
for col,key in enumerate(['joe','ike','jackson','chris','sam']):
 rgb=np.array(Image.open(f'tmp/stage-icon-hybrid/{key}-white.png').convert('RGB')).astype(float)
 prior=np.array(Image.open(r/'bw'/f'{key}-bw-transparent.png'))[:,:,3]
 refbg=prior==0
 candidate=((rgb.min(2)>243)&((rgb.max(2)-rgb.min(2))<12)).astype('uint8')
 n,labels,stats,centers=cv2.connectedComponentsWithStats(candidate,8)
 border=np.unique(np.concatenate((labels[0],labels[-1],labels[:,0],labels[:,-1])));border=border[border!=0]
 counts=np.bincount(labels[refbg],minlength=n)
 selected=[i for i in range(1,n) if i in border or counts[i]/max(stats[i,4],1)>.6]
 if key=='sam':
  protected=np.zeros(labels.shape,np.uint8)
  cv2.ellipse(protected,(514,806),(111,56),0,0,360,1,-1)
  protected_ids=set(np.unique(labels[protected>0]))-set(border)
  selected=[i for i in selected if i not in protected_ids]
 bg=np.isin(labels,selected)
 fg=(~bg).astype('uint8')
 count,l,stats,_=cv2.connectedComponentsWithStats(fg,8)
 for i in range(1,count):
  if stats[i,4]<12:fg[l==i]=0
 inside=cv2.erode(fg,np.ones((3,3),np.uint8),iterations=2)
 _,nearest=cv2.distanceTransformWithLabels(1-inside,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
 y,x=np.where(inside>0);lookup=np.zeros((len(y)+1,3));lookup[1:]=rgb[y,x]
 ref=lookup[nearest];band=(fg>0)&(inside==0)
 denom=255-ref;chan=np.argmax(denom,axis=2);den=np.take_along_axis(denom,chan[:,:,None],axis=2)[:,:,0]
 obs=np.take_along_axis(255-rgb,chan[:,:,None],axis=2)[:,:,0]
 alpha=fg.astype(float);estimate=np.clip(obs/np.maximum(den,1),0,1)
 alpha[band&(den>20)]=estimate[band&(den>20)]
 clean=rgb.copy();valid=band&(alpha>.005)
 clean[valid]=np.clip((rgb[valid]-255*(1-alpha[valid,None]))/alpha[valid,None],0,255)
 clean[alpha==0]=0
 rgba=np.dstack([np.round(clean).astype('uint8'),np.round(alpha*255).astype('uint8')]);im=Image.fromarray(rgba)
 out=dest/f'{key}-hybrid-transparent.png';im.save(out)
 thumb=im.copy();thumb.thumbnail((290,435),Image.Resampling.LANCZOS)
 px=col*300+(300-thumb.width)//2
 proof.paste(thumb,(px,35),thumb);dark.paste(thumb,(px,35),thumb)
 gray=ImageOps.grayscale(thumb).convert('RGBA');gray.putalpha(thumb.getchannel('A'));proof.paste(gray,(px,525),gray)
 for draw,rows in [(d,[0,490]),(dd,[0])]:
  for row in rows:draw.text((col*300+12,row+8),key.title()+(' / grayscale' if row else ' / hybrid'),font=font,fill='white' if draw is dd else 'black')
 assert im.getchannel('A').getextrema()==(0,255)
 reports.append({'file':out.name,'dimensions':im.size,'alpha_range':[0,255],'opaque_pixels':int((rgba[:,:,3]==255).sum()),'transparent_pixels':int((rgba[:,:,3]==0).sum())})
proof.save(dest/'hybrid-color-and-grayscale-proof.jpg',quality=95)
dark.save(dest/'hybrid-transparency-proof.jpg',quality=95)
(dest/'checks.json').write_text(json.dumps(reports,indent=2))
print(dest)
