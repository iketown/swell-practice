#target illustrator
(function(){
var d=app.activeDocument, ab=d.artboards[0].artboardRect;
var names=['JOE','CHRIS','BRIAN','JACKSON','SAM'], targets=[], report=[];
for(var n=0;n<names.length;n++){
 var found=[];
 for(var i=0;i<d.textFrames.length;i++){
  var t=d.textFrames[i], text=t.contents.replace(/^\s+|\s+$/g,'').toUpperCase(), b=t.geometricBounds;
  if(text===names[n]&&b[0]>=ab[0]&&b[2]<=ab[2]&&b[1]<=ab[1]&&b[3]>=ab[3]&&!t.hidden)found.push(t);
 }
 if(found.length!==1)throw Error('Expected one visible chest label for '+names[n]+', found '+found.length);
 if(found[0].locked||!found[0].editable)throw Error('Label is locked: '+names[n]);
 targets.push(found[0]);
}
d.save();
var backup=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/before-chest-backgrounds-'+(new Date().getTime())+'.ai');
if(!d.fullName.copy(backup))throw Error('Could not save backup');
var white=new RGBColor();white.red=255;white.green=255;white.blue=255;
for(var j=0;j<targets.length;j++){
 var label=targets[j], copy=label.duplicate(), outline=copy.createOutline(), bounds=outline.visibleBounds;
 var left=bounds[0]-2,top=bounds[1]+1.5,width=bounds[2]-bounds[0]+4,height=bounds[1]-bounds[3]+3;
 outline.remove();
 var box=label.parent.pathItems.rectangle(top,left,width,height);
 box.name=names[j]+' / white name background 90%';
 box.filled=true;box.fillColor=white;box.stroked=false;box.opacity=90;
 box.move(label,ElementPlacement.PLACEAFTER);
 report.push(names[j]+' | opacity='+box.opacity+' | bounds='+box.geometricBounds.join(','));
}
d.selection=null;app.redraw();d.save();
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/chest-backgrounds-result.txt');
f.open('w');f.write(report.join('\n'));f.close();
})();
