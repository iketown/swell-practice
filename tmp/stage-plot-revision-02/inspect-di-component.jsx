#target illustrator
(function(){
var d=app.activeDocument, out=[];
function dump(p,depth){
 var s=depth+' '+p.typename+' '+p.name+' bounds='+p.geometricBounds;
 if(p.typename==='TextFrame'){s+=' contents='+p.contents+' font='+p.textRange.characterAttributes.textFont.name+' size='+p.textRange.characterAttributes.size;}
 if(p.typename==='PathItem'){s+=' fill='+p.fillColor.typename;try{s+=' rgb='+p.fillColor.red+','+p.fillColor.green+','+p.fillColor.blue;}catch(e){}s+=' points='+p.pathPoints.length;}
 out.push(s);
 if(p.typename==='GroupItem')for(var i=0;i<p.pageItems.length;i++)if(p.pageItems[i].parent===p)dump(p.pageItems[i],depth+'  ');
}
out.push(d.name+' saved='+d.saved);
var l=d.layers.getByName('input numbers');
for(var i=0;i<l.pageItems.length;i++)if(l.pageItems[i].parent===l)dump(l.pageItems[i],'');
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/current-inspect.txt');f.open('w');f.write(out.join('\n'));f.close();
})();
