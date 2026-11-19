#target illustrator
(function(){
var base='/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/';
var log=File(base+'tmp/stage-plot-di/component-result.txt'),prev=app.coordinateSystem;
try{
 var d=app.activeDocument;
 if(d.name!=='the-swell-stage-plot-draft-01.ai')throw Error('Unexpected document');
 app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
 var l=d.layers.getByName('input numbers'),targets={},template=null,numberTemplate=null;
 function black(p){var c=p.fillColor;return p.filled&&c.typename==='RGBColor'&&c.red<1&&c.green<1&&c.blue<1;}
 function center(b){return [(b[0]+b[2])/2,(b[1]+b[3])/2];}
 function centerGlyph(t,x,y){var q=t.duplicate(),o=q.createOutline(),c=center(o.geometricBounds);o.remove();t.translate(x-c[0],y-c[1]);}
 for(var i=0;i<l.groupItems.length;i++){
  var g=l.groupItems[i];if(g.parent!==l)continue;
  var num=null,bg=null;
  for(var j=0;j<g.textFrames.length;j++)if(/^(6|7|8|9|10|11|12|13)$/.test(g.textFrames[j].contents))num=g.textFrames[j];
  for(var j=0;j<g.pathItems.length;j++)if(black(g.pathItems[j]))bg=g.pathItems[j];
  if(!num||!bg)continue;
  var n=num.contents;if(targets[n])throw Error('Duplicate black DI '+n);
  targets[n]={group:g,number:num,center:center(bg.geometricBounds)};
  if(n==='10'){template=g;numberTemplate=num;}
 }
 for(var n=6;n<=13;n++)if(!targets[n])throw Error('Missing DI '+n);
 if(!template||template.pathItems.length!==2||template.textFrames.length!==2)throw Error('Unexpected channel 10 template');
 var symbolName='DI badge / shared body';
 for(var i=0;i<d.symbols.length;i++)if(d.symbols[i].name===symbolName)throw Error('Symbol already exists');
 d.save();
 var backup=File(base+'tmp/stage-plot-di/before-reusable-di.ai');
 if(backup.exists)throw Error('Backup already exists');
 if(!d.fullName.copy(backup))throw Error('Backup failed');
 var source=template.duplicate(),bg=null,inset=null,di=null;
 for(var i=source.textFrames.length-1;i>=0;i--){if(source.textFrames[i].contents==='10')source.textFrames[i].remove();else if(source.textFrames[i].contents==='DI')di=source.textFrames[i];}
 for(var i=0;i<source.pathItems.length;i++){if(black(source.pathItems[i]))bg=source.pathItems[i];else inset=source.pathItems[i];}
 if(!bg||!inset||!di)throw Error('Incomplete template');
 var b=bg.geometricBounds,w=b[2]-b[0],h=b[1]-b[3],ic=center(inset.geometricBounds);
 var numberOffset=(b[1]+inset.geometricBounds[1])/2-center(b)[1];
 centerGlyph(di,ic[0],ic[1]);
 bg.name='Black DI body';inset.name='Rounded white DI label';di.name='DI label';
 var sym=d.symbols.add(source);sym.name=symbolName;
 try{source.remove();}catch(e){}
 var made=[],notes=[];
 for(var n=6;n<=13;n++){
  var old=targets[n],g=l.groupItems.add();g.name='DI '+n+' / symbol + editable number';
  var s=d.symbolItems.add(sym);s.move(g,ElementPlacement.PLACEATEND);s.name='Shared DI badge';
  var c=center(s.geometricBounds);s.translate(old.center[0]-c[0],old.center[1]-c[1]);
  var t=numberTemplate.duplicate(g,ElementPlacement.PLACEATBEGINNING);t.contents=String(n);t.name='Channel '+n+' (editable)';
  t.textRange.paragraphAttributes.justification=Justification.CENTER;
  centerGlyph(t,old.center[0],old.center[1]+numberOffset);
  g.note='Shared Symbol: '+symbolName+'. Edit the channel number with the Type tool; edit the symbol definition to update all DI bodies.';
  made.push(g);notes.push('DI '+n+' center='+old.center+' symbol='+s.symbol.name+' size='+s.width+','+s.height);
 }
 if(made.length!==8)throw Error('Wrong instance count');
 for(var n=6;n<=13;n++)targets[n].group.remove();
 d.selection=null;app.redraw();d.save();
 log.open('w');log.write('SUCCESS\n'+notes.join('\n')+'\nMaster dimensions '+w+' x '+h+'pt\nSaved '+d.fullName.fsName);log.close();
}catch(e){log.open('w');log.write('ERROR '+e+' line '+e.line);log.close();alert('DI components: '+e);}
finally{app.coordinateSystem=prev;}
})();
