import json, math, html
from pathlib import Path
root=Path.cwd(); out=root/'output/stage-plot'; g=json.loads((root/'tmp/stage-plot-draft/setup-graph.json').read_text()); nodes=g['nodes']; N={n['data']['name']:n for n in nodes}; ops=[];page=0;layer='';group='';INK='#182B35';GRAY='#54616A';LIGHT='#E6EAEC';ACC='#216575'
def add(kind,**kw):ops.append(dict(kind=kind,page=page,layer=layer,group=group,**kw))
def text(x,y,s,size=10,bold=False,color=INK,anchor='start'):add('text',x=x,y=y,text=s,size=size,bold=bold,fill=color,anchor=anchor)
def rect(x,y,w,h,fill='none',stroke=INK,sw=1):add('rect',x=x,y=y,w=w,h=h,fill=fill,stroke=stroke,sw=sw)
def ellipse(x,y,rx,ry=None,fill='white',stroke=INK,sw=1):add('ellipse',x=x,y=y,rx=rx,ry=ry if ry is not None else rx,fill=fill,stroke=stroke,sw=sw)
def path(points,stroke=INK,sw=1,fill='none',closed=False,dash=None):add('path',points=points,stroke=stroke,sw=sw,fill=fill,closed=closed,dash=dash)
def line(x,y,xx,yy,**kw):path([[x,y],[xx,yy]],**kw)
def center(n):
 p=n['stagePosition']; return p['xFeet']+p['widthFeet']/2,p['yFeet']+p['depthFeet']/2
def loc(name):
 x,y=center(N[name]);return 42+15*x,105+14*y # revised below: use uniform scale
S=14.5
OX,OY=42,105
SW,SH=46*S,24*S
def loc(name):x,y=center(N[name]);return OX+S*x,OY+S*y
def polyrect(cx,cy,w,h,angle,fill='white',stroke=INK):
 a=math.radians(angle);pts=[]
 for x,y in [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]:pts.append([cx+x*math.cos(a)-y*math.sin(a),cy+x*math.sin(a)+y*math.cos(a)])
 path(pts,stroke=stroke,fill=fill,closed=True)
def header(title,sub,pnum):
 global layer,group
 layer='Title and revision';group='Header'
 text(36,39,'THE SWELL',25,True);text(756,36,'DRAFT 01  /  29 SEP 2026',10,True,ACC,'end')
 text(36,59,title,12,True);text(36,76,sub,9.5,color=GRAY)
 line(36,88,756,88,stroke=INK,sw=1.2)
 group='Footer';line(36,540,756,540,stroke=LIGHT)
 text(36,557,'Setup: keyboard stage CENTER R  /  saved revision 49',8.5,color=GRAY)
 text(756,557,f'11 x 8 in  /  {pnum} of 2',8.5,color=GRAY,anchor='end')
header('STAGE PLOT  /  overhead view','Positions from the saved setup. Symbols are schematic; equipment centers preserve the source layout.',1)
layer='Stage boundary and orientation';group='Stage'
rect(OX,OY,SW,SH,'white',INK,1.3);rect(OX+38*S,OY,8*S,SH,'#F2F4F5','none')
line(OX+38*S,OY,OX+38*S,OY+SH,stroke=GRAY,dash=[4,4])
text(OX+19*S,122,'UPSTAGE / REAR',10,True,GRAY,'middle')
text(OX+42*S,124,'SIDESTAGE',10,True,GRAY,'middle');text(OX+42*S,139,'8 ft wide',9,color=GRAY,anchor='middle')
text(OX+19*S,OY+SH+17,'DOWNSTAGE / AUDIENCE',11,True,INK,'middle')
text(52,445,'STAGE RIGHT',10,True,GRAY);text(583,445,'STAGE LEFT',10,True,GRAY,anchor='end')
text(52,142,'Saved footprint',10,True);text(52,158,'46 ft wide x 24 ft deep',10);text(52,173,'Includes 8 ft sidestage.',9,color=GRAY);text(52,188,'Required minimum: TBC',9,color=GRAY)
# A compact key in the unused upstage area.
group='Legend';ellipse(480,153,4,fill=ACC,stroke=ACC);text(490,157,'Vocal microphone',9)
rect(476,168,9,7,'#E6EAEC',INK);text(490,175,'DI / processor',9)
rect(476,186,9,7,'white',GRAY);text(490,193,'Saved audio system*',9)
text(480,210,'Numbers = saved SD16 ports.',8.5,color=GRAY)
# Drum and instrument icons.
layer='Performers and instruments';group='Sam - drums'
cx,cy=loc('Drum kit');p=N['Drum kit']['stagePosition'];w=p['widthFeet']*S;h=p['depthFeet']*S
# Simple drum kit illustration fits source footprint.
ellipse(cx,cy+12,13,11,fill='#E6EAEC');ellipse(cx-11,cy-8,9);ellipse(cx+10,cy-8,10);ellipse(cx-23,cy+8,8);ellipse(cx+23,cy+7,10)
ellipse(cx-29,cy-15,12,6,fill='#F4F5F6');ellipse(cx+26,cy-19,12,6,fill='#F4F5F6')
for x,y in [(cx-29,cy-15),(cx+26,cy-19)]:line(x-4,y,x+4,y,stroke=GRAY)
# Named performer markers at true centers.
for name,label in [('Joe','JOE'),('Ike','IKE'),('Kron','CRON'),('Jackson','JACKSON'),('Sam','SAM')]:
 group=label+' - performer';x,y=loc(name);ellipse(x,y,9,7,fill='#D7E4E7',stroke=ACC);ellipse(x,y-1,3.5,fill='white',stroke=ACC)
# Guitar symbols, preserved source centers.
def guitar(name,kind):
 global group
 group=kind;x,y=loc(name);ellipse(x,y+7,7,9,fill='#E6EAEC');ellipse(x,y,5,6,fill='#E6EAEC');rect(x-1.5,y-16,3,17,'white',INK,0.8);rect(x-2,y-21,4,6,'#E6EAEC',INK,.8)
guitar('Fender telecaster','Joe - Telecaster');guitar('Electric bass','Cron - electric bass');guitar('Gibson ES-335 60s Semi-hollowbody Electric Guitar - Vintage Burst','Jackson - ES-335')
group='Ike - Nord keyboard';cx,cy=loc('Nord keys');p=N['Nord keys']['stagePosition'];a=p['rotationDegrees'];w=p['widthFeet']*S;h=p['depthFeet']*S
polyrect(cx,cy,w,h,a,'#E6EAEC')
# Individual key lines are editable paths, rotated around the stored center.
def rp(x,y):r=math.radians(a);return [cx+x*math.cos(r)-y*math.sin(r),cy+x*math.sin(r)+y*math.cos(r)]
for i in range(1,18):path([rp(-w/2+i*w/18,-h/2+5),rp(-w/2+i*w/18,h/2)],sw=.5)
# Small audio gear uses exaggerated symbols for print readability.
layer='Audio equipment';group='Processors and DI'
for name in ['Joe gtr','jackson gtr','Bass D.I.']:
 x,y=loc(name);polyrect(x,y,14,8,N[name]['stagePosition']['rotationDegrees'],'#E6EAEC');ellipse(x-3,y,1,fill=INK,stroke=INK,sw=.5);ellipse(x+3,y,1,fill=INK,stroke=INK,sw=.5)
# Console, digital box and snake endpoints.
for name,tag in [('Behringer X32','X32*'),('SD16 16-channel Stage Box','SD16*'),('front stagebox','FRONT*'),('BOX_A snake','FAN*')]:
 group=name;x,y=loc(name)
 if name=='Behringer X32':
  rect(x-25,y-16,50,32,'white',GRAY)
  for k in range(6):line(x-17+k*7,y-10,x-17+k*7,y+3,stroke=GRAY,sw=.6)
  text(x,y+13,tag,9,True,GRAY,'middle')
 elif name=='SD16 16-channel Stage Box':
  rect(x-16,y-10,32,20,'white',GRAY);text(x,y+3,tag,8,True,GRAY,'middle')
 else:
  rect(x-13,y-5,26,10,'white',GRAY);text(x,y+18,tag,8,True,GRAY,'middle')
group='Sam - MA400 headphone amp';x,y=loc('MicroMON MA400 Monitor Headphone Amplifier');rect(x-5,y-4,10,8,'#E6EAEC',GRAY,.8)
# Vocal microphone/stand symbols from source microphone and attached stand data.
layer='Microphones';
for name in ['joe mic','ike mic','cron mic','jackson mic','sam mic']:
 group=name;x,y=loc(name);ellipse(x,y,4,fill=ACC,stroke=ACC)
 p=N[name]['data'].get('stage3d',{}).get('attachment',{});parent=next((n for n in nodes if n['id']==p.get('parentNodeId')),None)
 if parent:
  xx,yy=center(parent);xx=OX+xx*S;yy=OY+yy*S;line(xx,yy,x,y,stroke=ACC,sw=1);ellipse(xx,yy,2,fill='white',stroke=ACC)
for name in ['Kick drum mic','Snare mic','OH L','OH R']:
 group=name;x,y=loc(name);ellipse(x,y,2.8,fill=ACC,stroke=ACC)
# Performer labels and short source descriptions, leaders terminate near relevant station.
layer='Labels and callouts'
def label(name,x,y,lines,target):
 global group
 group=name+' callout';tx,ty=target
 
 if name=='JOE': line(x+97,y+3,tx,ty,stroke='#88959D',sw=.65)
 elif name=='JACKSON': line(x-6,y+2,tx,ty,stroke='#88959D',sw=.65)
 elif name=='SAM': line(x+26,y+33,tx,ty,stroke='#88959D',sw=.65)
 else: line(x+25,y-17,tx,ty,stroke='#88959D',sw=.65)
 text(x,y,name,13,True)
 for i,s in enumerate(lines):text(x,y+13+12*i,s,9.5,color=GRAY)
label('JOE',129,302,['Gtr 08 / vocal 03','Modeler feed'],(loc('Joe')[0]-11,loc('Joe')[1]))
label('SAM',307,195,['Drums 13-16 / vocal 04','Kick / snare / OH pair'],(loc('Sam')[0],loc('Sam')[1]-9))
label('JACKSON',515,279,['Gtr 07 / vocal 02','Modeler feed'],(loc('Jackson')[0]+11,loc('Jackson')[1]))
label('IKE',266,414,['Keys 06 / vocal 01'],(loc('Nord keys')[0],loc('Nord keys')[1]+14))
label('CRON',410,414,['Bass 09 / vocal 05'],(loc('Kron')[0],loc('Kron')[1]+10))
group='Bass DI label';x,y=loc('Bass D.I.');text(x+12,y+4,'DI',9,True)
group='Monitor label';text(420,235,'MA400',8.5,color=GRAY);line(417,238,*loc('MicroMON MA400 Monitor Headphone Amplifier'),stroke='#88959D',sw=.65)
# Bottom production notes.
layer='Notes';group='Production notes'
text(36,494,'* Saved audio system shown for reference; touring supply and house interface TBC.',10,True)
text(36,510,'Audio crew determines cable routes and house patch. See page 2 for sources and open requirements.',9.5)
text(36,526,'Power drops / monitor mixes: TBC. No riser requirement confirmed. Backline supply is advanced separately.',9.5)
# Page two.
page=1
header('AUDIO INPUTS  /  saved patch reference','For audio production / house sound. Existing SD16 socket numbers; console channels and show-day supply to confirm.',2)
layer='Input list';group='Table heading'
cols=[36,76,233,348,560,756]
rect(36,103,720,23,INK,'none')
for x,s in [(44,'PORT'),(84,'SOURCE'),(241,'POSITION'),(356,'SIGNAL / INTERFACE'),(568,'MIC / DI / STAND')]:text(x,118,s,9,True,'white')
rows=[
('01','Ike vocal','Downstage SR','XLR microphone','Beta 87A (owned); boom'),
('02','Jackson vocal','Stage left','XLR microphone','Model TBC; boom'),
('03','Joe vocal','Stage right','XLR microphone','Model TBC; boom'),
('04','Sam vocal','Drums / center','XLR microphone','Model TBC; boom'),
('05','Cron vocal','Downstage SL','XLR microphone','Model TBC; boom'),
('06','Nord keyboard','Ike / downstage SR','1/4-inch output; 1 run saved','DI / mono-stereo TBC'),
('07','Jackson guitar','Stage left','Modeler 1/4-inch main out','Balanced feed / DI TBC'),
('08','Joe guitar','Stage right','Modeler 1/4-inch main out','Balanced feed / DI TBC'),
('09','Bass DI','Cron / downstage SL','XLR from DI','DI model / phantom TBC'),
('13','Overhead R','Drums','XLR microphone','Model / phantom TBC; tall boom'),
('14','Overhead L','Drums','XLR microphone','Model / phantom TBC; tall boom'),
('15','Snare','Drums','XLR microphone','Model TBC; low boom'),
('16','Kick','Drums','XLR microphone','Model TBC; short boom')]
for i,row in enumerate(rows):
 group='Input '+row[0];y=126+i*20
 if i%2==0:rect(36,y,720,20,'#F2F4F5','none')
 for j,s in enumerate(row):text(cols[j]+8,y+13.5,s,9.2,j==0)
 line(36,y+20,756,y+20,stroke=LIGHT,sw=.5)
text(36,402,'13 connected sources. SD16 ports 10-12 are unassigned in this snapshot. R/L overhead names retain source labels.',9,color=GRAY)
layer='Audio advance notes';group='Audio notes'
text(36,428,'MONITORS + POWER',10,True,ACC)
text(36,444,'MA400 headphone amp at drums; saved SD16 outputs 1/2 feed its monitor input.',9.5)
text(36,459,'Confirm all performers\' mixes, IEM/wedge choice, return patch, AC drops and load.',9.5)
text(36,477,'HOUSE INTERFACE + PHANTOM',10,True,ACC)
text(36,493,'Confirm band-supplied X32 / SD16 / snake, FOH split or handoff, gain and phantom responsibility.',9.5)
text(36,508,'Ike\'s Beta 87A needs phantom; confirm supply before patching. All other mic models remain TBC.',9.5)
text(36,523,'Backline: instrument / drum / stand supply is a separate advance. This sheet is not a rental order.',9.5)
# Save sanitized source with actual transforms, no image URLs or credentials.
source={'setupId':'g8qTbUz0v4xk40HzhHoD','revision':g['revision'],'captured':'2026-09-29','pageSizePoints':[792,576],'stageFeet':{'width':46,'depth':24,'sidestageWidth':8},'status':'draft','placements':[{'id':n['id'],'name':n['data']['name'],'category':n['data']['category'],'stagePosition':n.get('stagePosition')} for n in nodes],'audioInputs':[dict(zip(['savedSD16Port','source','position','interface','requirements'],r)) for r in rows],'notes':['Current source puts Ike at keys and Kron/Cron at bass. This intentionally supersedes the older formation.','Stage size is the saved planning footprint, not a confirmed minimum requirement.','Mic/DI icons exaggerated for readability. No cable topology is prescribed.','Source power flags are not treated as an approved electrical plan.','All supply assignments TBC except Ike microphone has an owned asset assignment.']}
(out/'the-swell-stage-source.json').write_text(json.dumps(source,indent=2))
(out/'drawing-objects.json').write_text(json.dumps(ops,indent=2))
# SVG previews / portable editable source.
for p in [0,1]:
 parts=['<svg xmlns="http://www.w3.org/2000/svg" width="792pt" height="576pt" viewBox="0 0 792 576"><rect width="792" height="576" fill="white"/>']
 for e in [o for o in ops if o['page']==p]:
  style=f'fill="{e.get("fill","none")}" stroke="{e.get("stroke","none")}" stroke-width="{e.get("sw",1)}"'
  if e['kind']=='text':parts.append(f'<text x="{e["x"]}" y="{e["y"]}" font-family="Helvetica, Arial, sans-serif" font-size="{e["size"]}" font-weight="{700 if e["bold"] else 400}" fill="{e["fill"]}" text-anchor="{e["anchor"]}">{html.escape(e["text"])}</text>')
  elif e['kind']=='rect':parts.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["w"]}" height="{e["h"]}" {style}/>')
  elif e['kind']=='ellipse':parts.append(f'<ellipse cx="{e["x"]}" cy="{e["y"]}" rx="{e["rx"]}" ry="{e["ry"]}" {style}/>')
  else:
   d='M '+' L '.join(f'{x},{y}' for x,y in e['points'])+(' Z' if e['closed'] else '');dash=' stroke-dasharray="'+','.join(map(str,e['dash']))+'"' if e.get('dash') else '';parts.append(f'<path d="{d}" {style}{dash}/>')
 parts.append('</svg>');(out/f'the-swell-{["stage-plot","audio-inputs"][p]}.svg').write_text('\n'.join(parts))
# Native Illustrator creation script: real paths and point text, grouped by role.
js='''#target illustrator
(function(){
var ops=OPS;
var doc=app.documents.add(DocumentColorSpace.RGB,792,576);
doc.artboards[0].name="01 Stage plot";
doc.artboards.add([840,576,1632,0]);doc.artboards[1].name="02 Audio inputs";
var layers={},groups={};
function color(h){if(h=="white")h="#FFFFFF";var c=new RGBColor();h=h.replace("#","");c.red=parseInt(h.substr(0,2),16);c.green=parseInt(h.substr(2,2),16);c.blue=parseInt(h.substr(4,2),16);return c;}
for(var i=0;i<ops.length;i++){
 var o=ops[i],lk=(o.page+1)+" / "+o.layer,gr=lk+" / "+o.group;
 if(!layers[lk]){layers[lk]=doc.layers.add();layers[lk].name=lk;}
 if(!groups[gr]){groups[gr]=layers[lk].groupItems.add();groups[gr].name=o.group;}
 var c=groups[gr],dx=o.page*840,it;
 if(o.kind=="text"){
  it=c.textFrames.pointText([dx+o.x,576-o.y]);it.contents=o.text;
  it.textRange.characterAttributes.size=o.size;
  it.textRange.characterAttributes.textFont=app.textFonts.getByName(o.bold?"Helvetica-Bold":"Helvetica");
  it.textRange.characterAttributes.fillColor=color(o.fill);
  if(o.anchor=="middle")it.textRange.paragraphAttributes.justification=Justification.CENTER;
  if(o.anchor=="end")it.textRange.paragraphAttributes.justification=Justification.RIGHT;
  it.name=o.text;
 }else{
  if(o.kind=="rect")it=c.pathItems.rectangle(576-o.y,dx+o.x,o.w,o.h);
  else if(o.kind=="ellipse")it=c.pathItems.ellipse(576-o.y+o.ry,dx+o.x-o.rx,o.rx*2,o.ry*2);
  else {it=c.pathItems.add();var pts=[];for(var j=0;j<o.points.length;j++)pts.push([dx+o.points[j][0],576-o.points[j][1]]);it.setEntirePath(pts);it.closed=o.closed;}
  it.filled=o.fill!="none";if(it.filled)it.fillColor=color(o.fill);
  it.stroked=o.stroke!="none";if(it.stroked){it.strokeColor=color(o.stroke);it.strokeWidth=o.sw; if(o.dash)it.strokeDashes=o.dash;}
  it.name=o.group+" / "+o.kind;
 }
}
// Remove only the newly-created document's unused default layer.
for(var k=doc.layers.length-1;k>=0;k--)if(doc.layers[k].pageItems.length==0)doc.layers[k].remove();
doc.artboards.setActiveArtboardIndex(0);app.executeMenuCommand("fitin");
var opts=new IllustratorSaveOptions();opts.pdfCompatible=true;opts.compressed=true;
doc.saveAs(new File(AIPATH),opts);
app.redraw();
})();
'''.replace('OPS',json.dumps(ops,separators=(',',':'))).replace('AIPATH',json.dumps(str(out/'the-swell-stage-plot-draft-01.ai')))
(out/'build-illustrator.jsx').write_text(js)
print('Wrote',len(ops),'editable drawing objects and 38 source placements')
