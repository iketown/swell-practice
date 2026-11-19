#target illustrator
(function(){
var d=app.activeDocument;
if(d.name!=='the-swell-stage-plot-draft-01.ai')throw Error('Wrong document');
var layer=d.layers.getByName('guy names'),names=['JOE','CHRIS','BRIAN','JACKSON','SAM'],targets=[],report=[];
function glyphBounds(t){var dup=t.duplicate(),o=dup.createOutline(),b=o.visibleBounds;var result=[b[0],b[1],b[2],b[3]];o.remove();return result;}
for(var n=0;n<names.length;n++){
 var ts=[],bs=[];
 for(var i=0;i<layer.textFrames.length;i++)if(layer.textFrames[i].contents.replace(/^\s+|\s+$/g,'').toUpperCase()===names[n])ts.push(layer.textFrames[i]);
 for(var j=0;j<layer.pathItems.length;j++)if(layer.pathItems[j].name===names[n]+' / white name background 90%')bs.push(layer.pathItems[j]);
 if(ts.length!==1||bs.length!==1)throw Error('Expected one text and box for '+names[n]);
 if(!ts[0].editable||!bs[0].editable)throw Error('Locked label '+names[n]);
 targets.push({text:ts[0],box:bs[0],name:names[n]});
}
d.save();if(!d.fullName.copy(File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/before-half-chest-labels-'+new Date().getTime()+'.ai')))throw Error('Backup failed');
for(var k=0;k<targets.length;k++){
 var t=targets[k].text,b=targets[k].box,old=glyphBounds(t),cx=(old[0]+old[2])/2,cy=(old[1]+old[3])/2,oldSize=t.textRange.characterAttributes.size;
 t.resize(50,50,true,true,true,true,50,Transformation.CENTER);
 var after=glyphBounds(t);t.translate(cx-(after[0]+after[2])/2,cy-(after[1]+after[3])/2);
 b.resize(50,50,true,true,true,true,50,Transformation.CENTER);b.opacity=90;
 var fin=glyphBounds(t);
 report.push(targets[k].name+' | font '+oldSize+' -> '+t.textRange.characterAttributes.size+' | glyph scale '+((fin[2]-fin[0])/(old[2]-old[0]))+' | center error '+((fin[0]+fin[2])/2-cx)+','+((fin[1]+fin[3])/2-cy)+' | box '+b.width+'x'+b.height+' | opacity '+b.opacity);
}
d.selection=null;app.redraw();d.save();var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/half-chest-labels-result.txt');f.open('w');f.write(report.join('\n'));f.close();
})();
