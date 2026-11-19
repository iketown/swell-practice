import json
from pathlib import Path
base=Path('/Users/brianeichenberger/.codex/skills/stage-plot')
def obj(properties, required=None):
 return {'type':'object','additionalProperties':False,'properties':properties,'required':list(properties) if required is None else required}
def arr(items): return {'type':'array','items':items}
def enum(*values): return {'enum':list(values)}
s={'type':'string','minLength':1}
pos={'type':'number','exclusiveMinimum':0}
nonneg={'type':'number','minimum':0}
nullable_num={'type':['number','null'],'exclusiveMinimum':0}
nullable_text={'type':['string','null'],'minLength':1}
provider=enum('band','venue','rental','unknown')
box={'x':nonneg,'y':nonneg,'width':pos,'depth':pos}
state=enum('confirmed','proposed','unknown')
schema=obj({
 'schema_version':{'const':1},'artist':s,'configuration':s,'revision_date':{'type':'string','format':'date'},'status':enum('draft','confirmed','example'),
 'contact':obj({'name':s,'email':nullable_text,'phone':nullable_text}),
 'stage':obj({'width':pos,'depth':pos,'unit':enum('ft','m'),'dimension_status':enum('confirmed','illustrative'),'view':{'const':'audience-top-down'},'origin':{'const':'upstage-stage-right'},'x_direction':{'const':'toward-stage-left'},'y_direction':{'const':'toward-audience'}}),
 'zones':arr(obj({'id':s,'performer':s,'depth_band':enum('upstage','midstage','downstage'),**box})),
 'nodes':arr(obj({'id':s,'zone_id':s,'kind':enum('amp','keyboard','drums','instrument','mic','di','wedge','iem','power','rack','riser'),'label':s,**box,'rotation':{'type':'number','minimum':0,'exclusiveMaximum':360},'supplier':provider})),
 'inputs':arr(obj({'channel':{'type':'integer','minimum':1},'source':s,'node_id':s,'connection':s,'mic_di':s,'stand':s,'phantom':enum('required','not-required','do-not-apply','unknown'),'supplier':provider,'stereo_pair':nullable_text,'side':enum('L','R',None),'routing':enum('foh-and-monitors','monitor-only','unknown'),'status':state,'notes':s})),
 'monitors':arr(obj({'id':s,'type':enum('wedge','iem','mixed'),'mode':enum('mono','stereo'),'zone_ids':arr(s),'node_ids':arr(s),'output_feeds':arr(s),'supplier':provider,'status':state,'notes':s})),
 'power':arr(obj({'id':s,'node_id':s,'equipment_node_ids':arr(s),'voltage':nullable_num,'frequency_hz':nullable_num,'outlets':{'type':['integer','null'],'minimum':1},'connector':s,'load_watts':{'type':['number','null'],'minimum':0},'circuit_request':s,'supplier':provider,'status':state,'notes':s})),
 'intentional_overlaps':arr(obj({'node_ids':{'type':'array','items':s,'minItems':2,'maxItems':2,'uniqueItems':True},'reason':s})),
 'open_questions':arr(s),'notes':arr(s)
})
schema={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'Stage plot document interchange v1','description':'Local document format, not the Swell application schema or an industry standard. All geometry uses declared stage units.',**schema}
(base/'assets/stage-plot.schema.json').write_text(json.dumps(schema,indent=2)+'\n')
zones=[dict(id='lead',performer='Alex - acoustic / vocal',depth_band='downstage',x=1,y=8,width=7,depth=6),dict(id='keys',performer='Taylor - keys / vocal',depth_band='midstage',x=16,y=6,width=7.5,depth=8),dict(id='perc',performer='Morgan - percussion',depth_band='upstage',x=8,y=1,width=8,depth=6)]
def node(id,zone,kind,label,x,y,w,d,supplier='band'):
 return dict(id=id,zone_id=zone,kind=kind,label=label,x=x,y=y,width=w,depth=d,rotation=0,supplier=supplier)
nodes=[node('lead-mic','lead','mic','Lead vocal',2,10,1,1,'venue'),node('acoustic','lead','instrument','Acoustic',4,10,1.5,2),node('acoustic-di','lead','di','Acoustic DI',2,12,.5,.5,'venue'),node('wedge-lead','lead','wedge','Wedge A / M1',4,13,1.8,1,'venue'),node('keyboard','keys','keyboard','Keys L/R',17,8,5,2),node('keys-mic','keys','mic','Keys vocal',22.5,8.5,.75,.75,'venue'),node('keys-di','keys','di','Stereo DI',17,11.5,.6,.5,'venue'),node('wedge-keys','keys','wedge','Wedge B / M1',20,12.5,2,1,'venue'),node('power-keys','keys','power','P1',22,11.5,.5,.5,'venue'),node('cajon','perc','drums','Cajon',10,2,3,3),node('perc-mic','perc','mic','Cajon mic',9,3,.5,.5,'venue'),node('iem-perc','perc','iem','Wired IEM / M2',14,3,1,1),node('power-perc','perc','power','P2',14,5,.5,.5,'venue')]
def inp(ch,source,nid,mic,stand,phantom,pair=None,side=None):
 return dict(channel=ch,source=source,node_id=nid,connection='Balanced XLR to house console',mic_di=mic,stand=stand,phantom=phantom,supplier='venue',stereo_pair=pair,side=side,routing='foh-and-monitors',status='proposed',notes='Illustrative choice; confirm actual equipment.')
inputs=[inp(1,'Acoustic pickup','acoustic-di','Compatible DI; model unresolved','none','unknown'),inp(2,'Alex vocal','lead-mic','SM58-class dynamic','tall boom','not-required'),inp(3,'Keys L','keys-di','Passive stereo DI, left channel','none','not-required','keys-stereo','L'),inp(4,'Keys R','keys-di','Passive stereo DI, right channel','none','not-required','keys-stereo','R'),inp(5,'Taylor vocal','keys-mic','SM58-class dynamic','tall boom','not-required'),inp(6,'Cajon','perc-mic','Suitable dynamic instrument mic','short boom','not-required')]
monitors=[dict(id='M1',type='wedge',mode='mono',zone_ids=['lead','keys'],node_ids=['wedge-lead','wedge-keys'],output_feeds=['Aux 1'],supplier='venue',status='proposed',notes='One shared mix feeding two wedges.'),dict(id='M2',type='iem',mode='stereo',zone_ids=['perc'],node_ids=['iem-perc'],output_feeds=['Aux 2 L','Aux 3 R'],supplier='band',status='proposed',notes='House supplies two balanced feeds; band supplies wired pack and ears.')]
power=[dict(id='P1',node_id='power-keys',equipment_node_ids=['keyboard'],voltage=120,frequency_hz=60,outlets=2,connector='US grounded outlet; confirm',load_watts=None,circuit_request='Unresolved; no dedicated circuit assumed',supplier='venue',status='proposed',notes='Illustrative US show; verify keyboard and adapter requirements.'),dict(id='P2',node_id='power-perc',equipment_node_ids=['iem-perc'],voltage=120,frequency_hz=60,outlets=1,connector='US grounded outlet; confirm',load_watts=None,circuit_request='Unresolved; no dedicated circuit assumed',supplier='venue',status='proposed',notes='Example powered wired IEM system; confirm exact pack supply.')]
data=dict(schema_version=1,artist='Fictional Trio - FORMAT EXAMPLE',configuration='Acoustic / stereo keys / percussion',revision_date='2026-09-29',status='example',contact=dict(name='Unassigned example contact',email=None,phone=None),stage=dict(width=24,depth=16,unit='ft',dimension_status='illustrative',view='audience-top-down',origin='upstage-stage-right',x_direction='toward-stage-left',y_direction='toward-audience'),zones=zones,nodes=nodes,inputs=inputs,monitors=monitors,power=power,intentional_overlaps=[],open_questions=['Confirm usable stage and physical operating footprints.','Confirm acoustic DI and phantom needs.','Confirm all power loads, outlets, and supplier commitments.'],notes=['Fictional teaching example, not The Swell.','Six physical inputs; two monitor mixes; three output feeds; two physical wedges.','Geometry illustrates the data format; it is not a measured touring plan.'])
(base/'assets/example-stage.json').write_text(json.dumps(data,indent=2)+'\n')
print('Wrote schema and fictional example')
