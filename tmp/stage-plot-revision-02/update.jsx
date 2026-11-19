#target illustrator
(function(){
try {
var d=app.activeDocument;
if(d.name.indexOf('the-swell-stage-plot-draft-01')!==0)throw new Error('Unexpected active document');
var prev=app.coordinateSystem;app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
var a=d.artboards[0].artboardRect, src=d.layers.getByName('images');
var inst=d.layers.getByName('1 / Performers and instruments'), mics=d.layers.getByName('1 / Microphones');
var replaced=d.layers.add();replaced.name='Original schematic symbols (archive)';
var icons=d.layers.add();icons.name='1 / Supplied instrument and mic icons';
var numbers=d.layers.add();numbers.name='1 / Circled input numbers';
function c(hex){var z=new RGBColor();z.red=parseInt(hex.substr(0,2),16);z.green=parseInt(hex.substr(2,2),16);z.blue=parseInt(hex.substr(4,2),16);return z;}
function item(layer,name){for(var j=0;j<layer.pageItems.length;j++)if(layer.pageItems[j].name===name)return layer.pageItems[j];throw new Error('Missing '+name);}
function replaceIcon(layer,oldName,sourceName,height,newName){
 var old=item(layer,oldName),b=old.geometricBounds,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
 var copy=item(src,sourceName).duplicate(icons,ElementPlacement.PLACEATEND);copy.name=newName;
 var pct=height/copy.height*100;copy.resize(pct,pct);copy.position=[cx-copy.width/2,cy+copy.height/2];
 old.move(replaced,ElementPlacement.PLACEATEND);return copy;
}
replaceIcon(inst,'Joe - Telecaster','elec gtr',44,'Joe - supplied electric guitar');
replaceIcon(inst,'Jackson - ES-335','elec gtr 2',44,'Jackson - supplied electric guitar');
replaceIcon(inst,'Cron - electric bass','bass gtr',44,'Ike - supplied bass guitar');
var drums=replaceIcon(inst,'Sam - drums','drum set',52,'Sam - supplied drum set');drums.translate(0,-7);
replaceIcon(mics,'joe mic','mic stand',26,'Joe - vocal 3 mic stand');
replaceIcon(mics,'ike mic','mic stand',26,'Cron - vocal 5 mic stand');
replaceIcon(mics,'cron mic','mic stand',26,'Ike - vocal 1 mic stand');
replaceIcon(mics,'jackson mic','mic stand',26,'Jackson - vocal 2 mic stand');
replaceIcon(mics,'sam mic','mic stand',23,'Sam - vocal 4 mic stand');
// Drum-source dots are replaced with individually numbered callouts.
for(var j=mics.groupItems.length-1;j>=0;j--)mics.groupItems[j].move(replaced,ElementPlacement.PLACEATEND);
replaced.visible=false;replaced.printable=false;
function change(group,from,to){for(var j=0;j<group.textFrames.length;j++){var t=group.textFrames[j];if(t.contents===from){t.contents=to;t.name=to;return;}}throw new Error('Missing text '+from);}
var labels=d.layers.getByName('1 / Labels and callouts');
var kl=item(labels,'IKE callout'),bl=item(labels,'CRON callout');
change(kl,'IKE','CRON');change(kl,'Keys 06 / vocal 01','Keyboard + vocal');kl.name='CRON callout';
change(bl,'CRON','IKE');change(bl,'Bass 09 / vocal 05','Bass DI + vocal');bl.name='IKE callout';
change(item(labels,'JOE callout'),'Gtr 08 / vocal 03','Guitar + vocal');
change(item(labels,'JACKSON callout'),'Gtr 07 / vocal 02','Guitar + vocal');
change(item(labels,'SAM callout'),'Drums 13-16 / vocal 04','Drums + vocal');
item(inst,'Ike - Nord keyboard').name='Cron - Nord keyboard';
var ip=item(inst,'IKE - performer'),cp=item(inst,'CRON - performer');ip.name='CRON - performer';cp.name='IKE - performer';
var table=d.layers.getByName('2 / Input list');
change(item(table,'Input 01'),'Downstage SR','Downstage SL');
change(item(table,'Input 05'),'Downstage SL','Downstage SR');
change(item(table,'Input 06'),'Ike / downstage SR','Cron / downstage SR');
change(item(table,'Input 09'),'Cron / downstage SL','Ike / downstage SL');
change(item(d.layers.getByName('2 / Audio advance notes'),'Audio notes'),"Ike's Beta 87A needs phantom; confirm supply before patching. All other mic models remain TBC.","Ike vocal remains input 1; Cron vocal remains input 5. Ike's Beta 87A requires phantom.");
// Replace the microphone-dot legend with the same circled-number convention as the plot.
var legend=item(d.layers.getByName('1 / Stage boundary and orientation'),'Legend');
change(legend,'Vocal microphone','Audio input number');
for(var j=legend.pathItems.length-1;j>=0;j--){var b=legend.pathItems[j].geometricBounds;if(legend.pathItems[j].width<12 && legend.pathItems[j].height>7 && (b[0]+b[2])/2 <a[0]+486 && (b[1]+b[3])/2 >a[1]-162){legend.pathItems[j].move(replaced,ElementPlacement.PLACEATEND);}}
function badge(n,x,y,name,r){
 var gr=numbers.groupItems.add();gr.name='Input '+n+' - '+name;
 var e=gr.pathItems.ellipse(a[1]-y+r,a[0]+x-r,r*2,r*2);e.filled=true;e.fillColor=c('FFFFFF');e.stroked=true;e.strokeColor=c('182B35');e.strokeWidth=1.1;
 var t=gr.textFrames.pointText([a[0]+x,a[1]-y]);t.contents=String(n);t.textRange.characterAttributes.textFont=app.textFonts.getByName('Helvetica-Bold');t.textRange.characterAttributes.size=10;t.textRange.characterAttributes.fillColor=c('182B35');
 t.textRange.paragraphAttributes.justification=Justification.CENTER;
 var b=t.geometricBounds;t.translate(a[0]+x-(b[0]+b[2])/2,a[1]-y-(b[1]+b[3])/2);
}
// On the microphone heads, behind the keyboard, and beside each remaining source.
badge(5,334,364,'Cron vocal',8.5);badge(2,487,318,'Jackson vocal',8.5);badge(3,258,321,'Joe vocal',8.5);badge(4,394,263,'Sam vocal',8.5);badge(1,411,357,'Ike vocal',8.5);
badge(6,303,367,'Keyboard rear output',8.5);badge(7,544,322,'Jackson modeler',8.5);badge(8,213,353,'Joe modeler',8.5);badge(9,461,333,'Bass DI',8.5);
badge(13,310,286,'Overhead R',8.5);badge(14,386,294,'Overhead L',8.5);badge(15,327,264,'Snare',8.5);badge(16,351,321,'Kick',8.5);
badge(1,480,153,'Legend example',7);
for(var j=0;j<d.textFrames.length;j++){
 var t=d.textFrames[j];if(t.contents==='DRAFT 01  /  29 SEP 2026'){t.contents='DRAFT 02  /  29 SEP 2026';t.name=t.contents;}
 if(t.contents==='Setup: keyboard stage CENTER R  /  saved revision 49'){t.contents='Setup rev 49 + Brian\'s performer / icon revisions';t.name=t.contents;}
}
d.artboards.setActiveArtboardIndex(0);app.executeMenuCommand('fitin');d.save();app.coordinateSystem=prev;app.redraw();
}catch(e){alert('Stage plot update: '+e+' at line '+e.line);}
})();
