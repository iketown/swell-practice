#target illustrator
(function(){
var d=app.activeDocument,l=d.layers.getByName('input numbers'),targets=[],seen={},expected=['1','2','3','4','5','14','15','16'];
for(var i=0;i<l.groupItems.length;i++){
 var g=l.groupItems[i];
 if(g.parent!==l||g.symbolItems.length||g.textFrames.length!==1||g.pathItems.length!==1)continue;
 var t=g.textFrames[0],num=t.contents.replace(/^\s+|\s+$/g,''),p=g.pathItems[0];
 if(!/^(1|2|3|4|5|14|15|16)$/.test(num))continue;
 if(!p.filled||p.fillColor.typename!=='RGBColor'||p.fillColor.red!==255||p.fillColor.green!==255||p.fillColor.blue!==255)throw Error('Unexpected marker background '+num);
 if(g.pageItems.length!==2||g.hidden||g.locked||!g.editable)throw Error('Unexpected or locked marker '+num);
 if(seen[num])throw Error('Duplicate marker '+num);
 seen[num]=true;var b=p.geometricBounds;
 targets.push({old:g,num:num,cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2});
}
for(var n=0;n<expected.length;n++)if(!seen[expected[n]])throw Error('Missing microphone marker '+expected[n]);
var font=app.textFonts.getByName('Helvetica-Bold');
d.save();if(!d.fullName.copy(File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/before-mic-squares-'+new Date().getTime()+'.ai')))throw Error('Backup failed');
var black=new RGBColor();black.red=0;black.green=0;black.blue=0;
var white=new RGBColor();white.red=255;white.green=255;white.blue=255;
var report=[];
for(var j=0;j<targets.length;j++){
 var q=targets[j],fresh=l.groupItems.add();fresh.name='Mic input '+q.num+' / square + centered number';fresh.move(q.old,ElementPlacement.PLACEBEFORE);
 var box=fresh.pathItems.rectangle(q.cy+9,q.cx-9,18,18);box.name='18 pt square';box.filled=true;box.fillColor=white;box.stroked=true;box.strokeWidth=1;box.strokeColor=black;
 var text=fresh.textFrames.add();text.contents=q.num;text.name='Channel '+q.num+' (editable)';
 text.textRange.characterAttributes.textFont=font;text.textRange.characterAttributes.size=10.4311790466309;text.textRange.characterAttributes.fillColor=black;
 text.position=[q.cx,q.cy];
 var copy=text.duplicate(),outline=copy.createOutline(),b=outline.visibleBounds,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;outline.remove();
 text.translate(q.cx-cx,q.cy-cy);
 var v=text.duplicate(),o=v.createOutline(),vb=o.visibleBounds,dx=(vb[0]+vb[2])/2-q.cx,dy=(vb[1]+vb[3])/2-q.cy;o.remove();
 if(Math.abs(dx)>0.01||Math.abs(dy)>0.01)throw Error('Center verification failed '+q.num);
 q.old.remove();report.push(q.num+' | 18x18 pt | Helvetica-Bold 10.431179 pt | glyph center error '+dx+','+dy+' pt | center '+q.cx+','+q.cy);
}
d.selection=null;app.redraw();d.save();
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/mic-squares-result.txt');f.open('w');f.write(report.join('\n'));f.close();
})();
