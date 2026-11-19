import sys
sys.path.insert(0,'tmp/stage-icon-cleanup-deps')
import cv2,numpy as np
from PIL import Image
from pathlib import Path
src=Path('/Users/brianeichenberger/.codex/generated_images/01a0ecfd-f705-74c1-b3f4-ee42330d3149/exec-35bea22d-16b4-40c5-996e-0c13a85989d3.png')
dest=Path('output/stage-plot/performer-icons/transparent/the-swell-stage-icons-transparent/hybrid')
rgb=np.array(Image.open(src).convert('RGB')).astype(float)
fg=(rgb.min(2)<245).astype('uint8')
n,l,s,_=cv2.connectedComponentsWithStats(fg,8);fg=(l==(1+np.argmax(s[1:,4]))).astype('uint8')
# Fill any enclosed pale highlights and antialias only the outer silhouette.
fg=cv2.morphologyEx(fg,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
inside=cv2.erode(fg,np.ones((3,3),np.uint8),iterations=2)
_,nearest=cv2.distanceTransformWithLabels(1-inside,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
y,x=np.where(inside>0);lookup=np.zeros((len(y)+1,3));lookup[1:]=rgb[y,x]
ref=lookup[nearest];band=(fg>0)&(inside==0)
denom=255-ref;chan=np.argmax(denom,2);den=np.take_along_axis(denom,chan[:,:,None],2)[:,:,0];obs=np.take_along_axis(255-rgb,chan[:,:,None],2)[:,:,0]
a=fg.astype(float);est=np.clip(obs/np.maximum(den,1),0,1);a[band&(den>20)]=est[band&(den>20)]
clean=rgb.copy();valid=band&(a>.005);clean[valid]=np.clip((rgb[valid]-255*(1-a[valid,None]))/a[valid,None],0,255);clean[a==0]=0
im=Image.fromarray(np.dstack([clean.astype('uint8'),np.round(a*255).astype('uint8')]))
im.save(dest/'boom-mic-stand-overhead-v2-transparent.png')
proof=Image.new('RGBA',im.size,'#8191a0');proof.alpha_composite(im);proof.thumbnail((512,768));proof.convert('RGB').save('tmp/stage-icon-mic/transparency-proof-v2.jpg',quality=95)
assert im.getchannel('A').getextrema()==(0,255)
print(dest/'boom-mic-stand-overhead-v2-transparent.png')
