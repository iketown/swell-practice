from pathlib import Path
from html import escape
import xml.etree.ElementTree as ET
OUT=Path('output/stage-plot/performer-icons/transparent/the-swell-stage-icons-transparent/hybrid')
INK='#202426'
def rect(x,y,w,h,fill,r=0,stroke=INK,sw=3):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
def circ(x,y,r,fill,stroke=INK,sw=3):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
def line(x,y,X,Y,color=INK,sw=3):
    return f'<path d="M{x} {y} L{X} {Y}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
def label(x,y,s,size=16,color='#f6f5f0',anchor='middle',weight=600):
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" stroke="none">{escape(s)}</text>'
def knob(x,y,r=16):
    return '<g>'+circ(x,y+7,r,'#383d3e')+circ(x,y,r,'#b7baba')+f'<path d="M{x-r+4} {y+2} A{r-4} {r-4} 0 0 1 {x+2} {y-r+4}" fill="none" stroke="#eff0eb" stroke-width="3" stroke-linecap="round"/>'+line(x,y-4,x,y-r+4,INK,3)+'</g>'
def switch(x,y,tint='#b3c3bc'):
    return '<g>'+circ(x,y+4,22,tint)+circ(x,y+3,16,'#717777')+rect(x-13,y-9,26,15,'#b9bfbe',4,INK,2)+circ(x,y-9,13,'#efeee7',INK,2)+line(x-6,y-15,x+4,y-15,'#fff',2)+'</g>'
def doc(name,w,d,body):
    W=w+80; H=round(d*.70710678+100)
    # The top plane is foreshortened at 45 degrees, with a visible front lip.
    frontY=40+d*.70710678
    s=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">
<title id="title">{name} — simplified 45 degree overhead illustration</title>
<desc id="desc">Editable vector paths and shapes on a transparent background. Muted color, strong outlines, simplified controls. Camera elevated 45 degrees facing the front edge.</desc>
<g id="enclosure-front">{rect(40,frontY-15,w,49,'#42494b',14,INK,5)}{line(59,frontY+24,w+20,frontY+24,'#737a7a',3)}</g>
<g id="top-plane" transform="matrix(1 0 0 0.70710678 40 40)" stroke-linejoin="round" stroke-linecap="round">
{rect(0,0,w,d,'#666d6d',15,INK,6)}
{body}
</g></svg>'''
    return s
# KEMPER: distinctive upper control surface and two rows of six footswitches.
b=rect(13,12,974,287,'#626b68',10,INK,3)
b+=label(957,284,'KEMPER',22,anchor='end')
b+=rect(192,80,273,88,'#c1d8cb',7,INK,4)
b+=rect(203,90,251,65,'#d9e6db',3,'#7d9588',2)
b+=label(328,119,'PROFILER',23,'#344d44')+line(215,133,441,133,'#738f7d',2)
for x in [230,285,340,395]: b+=rect(x,142,30,5,'#839e8d',1,'none',0)
for x in [226,291,356,421]: b+=circ(x,44,9,'#edece5',INK,2)
for x in [230,294,358,422]: b+=knob(x,221,15)
for x in [135,519]:
    b+=knob(x,42,21)+knob(x,220,28)
    for dx,dy in [(-33,0),(-28,-22),(-10,-36),(13,-34),(32,-19)]: b+=circ(x+dx,220+dy,3.5,'#c9e4d4','none',0)
b+=circ(60,63,10,'#f1f0e9',INK,2)
for y in [177,219]: b+=circ(60,y,10,'#eeeae0',INK,2)
for x in [91,125,159]: b+=rect(x,134,24,15,'#e8e7df',3,INK,2)
for y in [101,146]:
    b+=circ(140,y,9,'#eeeae0',INK,2)+circ(520,y,9,'#eeeae0',INK,2)
for y in [65,108,151]: b+=circ(598,y,9,'#eeeae0',INK,2)
b+=f'<path d="M668 44 L639 132 L697 132 Z" fill="none" stroke="#e2e5da" stroke-width="3"/>'+label(668,111,'K',27)
for x,txt in [(765,'LOOP'),(918,'TUNER')]: b+=switch(x,106,'#bbc5bb')+label(x,64,txt,15)
for i in range(11):
    x=597+i*33
    b+=circ(x,199,4,'#c1d5c6' if i in [1,2,7,8] else '#969e97','none',0)+rect(x-10,216,20,15,'#e0e4db',2,INK,2)
b+=rect(13,311,974,91,'#747b77',9,INK,3)
b+=line(22,413,978,413,'#343c38',4)
for i,x in enumerate([65,239,413,587,761,935]):
    b+=switch(x,362,'#c4cbc2')
    b+=label(x+38,367,['↑','↓','I','II','III','IV'][i],19,'#ebded3')
    b+=label(x,453,['1','2','3','4','5','TAP'][i],25)
    b+=switch(x,490,'#bbd5c4' if i==3 else '#b7c2b9')
kemper=doc('Kemper Profiler Stage',1000,540,b)
(OUT/'kemper-profiler-stage-45deg.svg').write_text(kemper)
# HX: three switches at rear left, five at front; raised control panel at rear right.
b=label(28,47,'LINE 6',24,anchor='start')+label(165,47,'HX STOMP XL',28,anchor='start')
b+=rect(555,25,384,192,'#41494c',10,INK,4)
b+=rect(562,15,377,191,'#737b7d',9,INK,4)
b+=rect(587,36,179,110,'#252c30',5,INK,4)
b+=rect(596,45,161,92,'#b5ccce',2,'none',0)
b+=label(676,72,'HX STOMP XL',16,'#2f484d')
for i,c in enumerate(['#d1e0d2','#e3d3bc','#c6cadd']):
    b+=rect(607+i*47,89,36,26,c,4,'#465759',2)
b+=line(610,123,742,123,'#607c80',3)
for x in [606,677,748]: b+=knob(x,180,16)
for y in [61,132]:
    b+=rect(788,y-21,131,42,'#555f61',5,INK,2)+knob(852,y-2,20)
b+=label(802,65,'•',15)+label(903,65,'•',15)+label(802,136,'‹',20)+label(903,136,'›',20)
for x,t in [(64,'↑'),(269,'C'),(474,'D')]:
    b+=label(x,93,t,24)+switch(x,133,'#c4c6d8')
for x,t in [(64,'↓'),(269,'A'),(474,'B'),(679,'MODE'),(884,'TAP')]:
    b+=label(x,262,t,23)+switch(x,307,'#c4c6d8')
b+=line(23,353,936,353,'#8c9696',3)
hx=doc('Line 6 HX Stomp XL',960,370,b)
(OUT/'line6-hx-stomp-xl-45deg.svg').write_text(hx)
for f in [OUT/'kemper-profiler-stage-45deg.svg',OUT/'line6-hx-stomp-xl-45deg.svg']:
    root=ET.parse(f).getroot()
    assert not root.findall('.//{http://www.w3.org/2000/svg}image')
    print(f)
