#target illustrator
(function(){
var d=app.activeDocument, inputs=d.layers.getByName('input numbers'), anchor=null;
for(var i=0;i<inputs.groupItems.length;i++){
 var item=inputs.groupItems[i];
 if(item.name==='DI 7 / symbol + editable number'){if(anchor)throw Error('Duplicate DI 7');anchor=item;}
}
if(!anchor)throw Error('Joe guitar DI 7 marker not found');
for(var j=0;j<d.groupItems.length;j++)if(d.groupItems[j].name==='AC power / Joe guitar pedal')throw Error('AC icon already exists');
d.save();
var b=anchor.visibleBounds, x=b[2]+32, y=b[1], size=18;
var layer=d.layers.add();layer.name='AC power';
var g=layer.groupItems.add();g.name='AC power / Joe guitar pedal';
var black=new RGBColor();black.red=0;black.green=0;black.blue=0;
var white=new RGBColor();white.red=255;white.green=255;white.blue=255;
var box=g.pathItems.rectangle(y,x,size,size);box.name='Square';box.filled=true;box.fillColor=white;box.stroked=true;box.strokeColor=black;box.strokeWidth=1;
var bolt=g.pathItems.add();bolt.name='Lightning bolt';
var points=[[10.3,2.7],[5.2,10.1],[8.7,10.1],[7.7,15.3],[13.2,7.6],[9.7,7.6]];
var path=[];for(var k=0;k<points.length;k++)path.push([x+points[k][0],y-points[k][1]]);
bolt.setEntirePath(path);bolt.closed=true;bolt.filled=true;bolt.fillColor=black;bolt.stroked=false;
d.selection=null;app.redraw();d.save();
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/ac-power-result.txt');f.open('w');f.write(g.name+' | '+g.visibleBounds.join(',')+' | 18 pt square, black bolt, white background');f.close();
})();
