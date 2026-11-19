#target illustrator
(function(){
var log=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/stage-plot-di/result.txt');
var prev=app.coordinateSystem;
try {
 var d=app.activeDocument;
 if(d.name!=='the-swell-stage-plot-draft-01.ai') throw Error('Unexpected active document: '+d.name);
 app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
 var layer=d.layers.getByName('1 / Circled input numbers');
 var targets=[];
 for(var n=6;n<=9;n++) {
  var found=[];
  for(var i=0;i<layer.groupItems.length;i++){
   var g=layer.groupItems[i];
   if(g.name.indexOf('Input '+n+' - ')===0)found.push(g);
  }
  if(found.length!==1)throw Error('Expected one group for input '+n+', found '+found.length);
  var g=found[0];
  if(g.pathItems.length!==1 || g.textFrames.length!==1 || g.textFrames[0].contents!==String(n))throw Error('Unexpected contents for '+n);
  if(g.locked || g.hidden || layer.locked || !layer.visible)throw Error('Target unavailable: '+n);
  targets.push(g);
 }
 var black=new RGBColor();black.red=black.green=black.blue=0;
 var white=new RGBColor();white.red=white.green=white.blue=255;
 var notes=[];
 for(var i=0;i<targets.length;i++){
  var g=targets[i],p=g.pathItems[0],b=p.geometricBounds;
  var cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,s=Math.max(b[2]-b[0],b[1]-b[3]);
  p.setEntirePath([[cx-s/2,cy+s/2],[cx+s/2,cy+s/2],[cx+s/2,cy-s/2],[cx-s/2,cy-s/2]]);
  p.closed=true;
  for(var j=0;j<p.pathPoints.length;j++){
   var a=p.pathPoints[j].anchor;p.pathPoints[j].leftDirection=a;p.pathPoints[j].rightDirection=a;p.pathPoints[j].pointType=PointType.CORNER;
  }
  p.filled=true;p.fillColor=black;p.stroked=true;p.strokeColor=black;
  p.name='DI input '+(i+6)+' - black square';
  g.textFrames[0].textRange.characterAttributes.fillColor=white;
  notes.push('Input '+(i+6)+': black square, white number; center '+cx+','+cy+'; size '+s);
 }
 app.redraw();d.save();
 log.open('w');log.write('SUCCESS\n'+notes.join('\n'));log.close();
}catch(e){log.open('w');log.write('ERROR '+e+' at line '+e.line);log.close();alert('DI update: '+e);}
finally{app.coordinateSystem=prev;}
})();
