#target illustrator
(function(){
var d=app.activeDocument,l=d.layers.getByName('input numbers'),notes=[];
function center(b){return[(b[0]+b[2])/2,(b[1]+b[3])/2];}
for(var i=0;i<l.groupItems.length;i++){
 var g=l.groupItems[i];if(g.parent!==l||g.name.indexOf('/ symbol + editable number')<0)continue;
 var scratch=l.groupItems.add(),s=g.symbolItems[0].duplicate(scratch,ElementPlacement.PLACEATEND);s.breakLink();
 var bg=null,white=null;
 function walk(p){if(p.typename==='PathItem'&&p.filled&&p.fillColor.typename==='RGBColor'){if(p.fillColor.red===0)bg=p;else if(p.fillColor.red===255)white=p;}else if(p.typename==='GroupItem'){for(var k=0;k<p.pageItems.length;k++)if(p.pageItems[k].parent===p)walk(p.pageItems[k]);}}
 walk(scratch);if(!bg||!white)throw Error('Missing badge geometry');
 var b=bg.geometricBounds,x=(b[0]+b[2])/2,y=(b[1]+white.geometricBounds[1])/2;
 scratch.remove();
 var t=g.textFrames[0],q=t.duplicate(),o=q.createOutline(),c=center(o.geometricBounds);o.remove();t.translate(x-c[0],y-c[1]);
 notes.push(g.name+' centered');
}
d.selection=null;app.redraw();d.save();
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/centering.txt');f.open('w');f.write(notes.join('\n'));f.close();
})();
