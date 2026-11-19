"""Low-poly instrument geometry traced from the user's 2026-09-08 reference photos.
Photo coordinates determine appearance only; linked measurement roots retain their dimensions.
"""
import math
import bpy
from mathutils import Vector
from .models import material

PROFILES = {
 'tele': dict(bounds=(436,836,60,1242), body=[(609,758),(580,749),(550,738),(522,735),(494,744),(474,761),(466,793),(471,829),(486,868),(496,907),(495,946),(481,986),(458,1033),(442,1074),(437,1111),(440,1152),(455,1190),(483,1219),(521,1235),(578,1240),(650,1242),(718,1239),(771,1228),(807,1208),(828,1178),(836,1144),(833,1104),(821,1064),(801,1020),(785,983),(777,948),(780,912),(792,872),(801,835),(805,800),(801,769),(790,752),(775,750),(762,760),(753,782),(743,805),(728,822),(710,829),(691,823),(678,805)],
 guard=[(610,775),(592,783),(574,805),(558,842),(546,882),(541,927),(542,967),(550,983),(591,981),(595,972),(694,972),(699,982),(747,983),(784,981),(775,955),(772,926),(779,891),(790,850),(797,811),(795,781),(786,764),(777,760),(767,773),(756,800),(740,823),(722,833),(701,836),(680,824),(671,815),(671,837),(609,837)],
 head=[(623,260),(669,261),(672,231),(683,206),(688,178),(682,150),(680,124),(690,105),(693,85),(686,69),(674,61),(661,61),(651,73),(645,102),(635,136),(624,177),(612,215),(604,236),(608,249)], nut=(647,260), heel=(644,833), bridge=(645,1065), frets=21),
 'mustang': dict(bounds=(235,598,45,1235),body=[(382,736),(362,744),(342,741),(322,729),(308,707),(298,690),(286,687),(274,698),(265,721),(260,750),(262,781),(271,813),(285,848),(291,882),(289,917),(278,950),(262,990),(247,1034),(238,1076),(235,1120),(241,1159),(258,1190),(286,1212),(325,1226),(371,1233),(426,1235),(478,1230),(524,1214),(561,1190),(584,1158),(597,1121),(596,1089),(583,1056),(564,1020),(542,985),(533,954),(536,919),(548,877),(557,837),(559,808),(551,779),(541,765),(530,767),(522,785),(508,801),(488,811),(468,809),(451,798),(444,780)],
 guard=[(382,762),(363,773),(348,795),(337,826),(329,861),(325,900),(324,938),(328,971),(338,995),(354,1008),(381,1015),(429,1016),(464,1018),(482,1004),(493,985),(520,974),(522,950),(528,914),(542,868),(548,833),(548,808),(541,784),(535,779),(523,800),(506,813),(487,818),(466,815),(445,801),(444,841),(382,840)],
 head=[(385,255),(428,255),(442,239),(465,229),(460,201),(453,171),(449,140),(447,117),(457,99),(462,79),(457,59),(444,48),(427,45),(410,52),(400,70),(391,102),(381,140),(370,179),(360,214),(359,239)], nut=(407,255),heel=(415,846),bridge=(421,1140),frets=19),
 '335': dict(bounds=(405,873,15,1255),body=[(592,721),(576,736),(561,733),(548,718),(539,697),(525,686),(507,685),(489,693),(476,707),(467,728),(465,752),(469,778),(477,804),(489,833),(497,858),(496,880),(487,902),(470,924),(450,947),(432,973),(416,1005),(408,1037),(406,1071),(410,1107),(421,1141),(442,1174),(470,1201),(507,1223),(549,1240),(594,1250),(640,1255),(687,1251),(735,1238),(778,1216),(815,1187),(841,1154),(860,1114),(870,1077),(872,1045),(866,1014),(853,983),(834,954),(811,927),(789,904),(773,884),(766,863),(769,840),(779,814),(790,785),(797,758),(798,733),(791,711),(777,694),(759,686),(741,686),(726,695),(717,715),(706,733),(690,738),(672,731),(653,710)],
 guard=[(658,746),(685,758),(699,779),(703,815),(712,853),(730,893),(747,935),(758,965),(756,981),(743,990),(725,992),(702,984),(681,979),(669,980),(670,763)],
 head=[(603,203),(649,202),(653,180),(675,165),(683,107),(692,27),(685,20),(670,20),(657,16),(649,18),(643,14),(633,19),(619,22),(607,24),(605,83),(603,133),(595,166)], nut=(625,204),heel=(622,757),bridge=(618,957),frets=22),
}


def build(root, kind, dimensions):
    p=PROFILES[kind];left,right,top,bottom=p['bounds'];w,d,h=dimensions
    col=root.users_collection[0]
    black=material('Instrument ebony',(.009,.008,.006)); chrome=material('Instrument nickel',(.52,.57,.60))
    bs=chrome.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=.8;bs.inputs['Roughness'].default_value=.25
    maple=material('Instrument maple',(.62,.36,.105)); rose=material('Instrument rosewood',(.045,.018,.009)); cream=material('Instrument ivory',(.87,.79,.59))
    gold=material('Instrument amber knobs',(.48,.22,.025))
    finish=material('Mustang faded blue',(.105,.43,.48)) if kind=='mustang' else material('Tele blonde ash',(.68,.43,.115)) if kind=='tele' else material('335 vintage sunburst',(.42,.17,.015))
    finish.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.31
    if kind=='335':
        nodes=finish.node_tree.nodes;links=finish.node_tree.links
        if not nodes.get('Burst color'):
            tex=nodes.new('ShaderNodeTexCoord');sep=nodes.new('ShaderNodeSeparateXYZ');links.new(tex.outputs['Generated'],sep.inputs[0])
            def mathnode(op,a,b):
                n=nodes.new('ShaderNodeMath');n.operation=op
                if isinstance(a,(int,float)):n.inputs[0].default_value=a
                else:links.new(a,n.inputs[0])
                if isinstance(b,(int,float)):n.inputs[1].default_value=b
                else:links.new(b,n.inputs[1])
                return n.outputs[0]
            x=mathnode('MULTIPLY',mathnode('SUBTRACT',sep.outputs['X'],.5),2)
            z=mathnode('MULTIPLY',mathnode('SUBTRACT',sep.outputs['Z'],.37),1.75)
            radius=mathnode('SQRT',mathnode('ADD',mathnode('MULTIPLY',x,x),mathnode('MULTIPLY',z,z)),0)
            ramp=nodes.new('ShaderNodeValToRGB');ramp.name='Burst color';ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
            for i,(pos,color) in enumerate([(0,(.74,.40,.045,1)),(.48,(.66,.29,.02,1)),(.74,(.25,.058,.009,1)),(.92,(.045,.006,.003,1))]):
                e=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(pos);e.position=pos;e.color=color
            links.new(radius,ramp.inputs[0]);links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    def co(x,y,depth=0):return Vector(((x-(left+right)/2)/(right-left)*w,depth*d,(bottom-y)/(bottom-top)*h))
    def mesh(name,verts,faces,mat):
        data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
        obj=bpy.data.objects.new(name,data);col.objects.link(obj);obj.parent=root;obj.hide_select=True;obj['swell_visual']=True;data.materials.append(mat);return obj
    def plate(name,outline,front,back,mat,bevel=0):
        n=len(outline);obj=mesh(name,[co(x,y,z) for z in (front,back) for x,y in outline],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
        if bevel:
            mod=obj.modifiers.new('Tiny softened edge','BEVEL');mod.width=bevel;mod.segments=1
        return obj
    def rect(name,x,y,ww,hh,front,back,mat):return plate(name,[(x-ww/2,y-hh/2),(x+ww/2,y-hh/2),(x+ww/2,y+hh/2),(x-ww/2,y+hh/2)],front,back,mat)
    def disc(name,x,y,r,front,back,mat,rx=None):
        return plate(name,[(x+(rx or r)*math.cos(i*math.tau/12),y+r*math.sin(i*math.tau/12)) for i in range(12)],front,back,mat)
    def line(name,coords,depth,radius,mat):
        data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=0
        spline=data.splines.new('POLY');spline.points.add(len(coords)-1)
        for point,(x,y) in zip(spline.points,coords):point.co=(*co(x,y,depth),1)
        obj=bpy.data.objects.new(name,data);col.objects.link(obj);obj.parent=root;obj.hide_select=True;obj['swell_visual']=True;data.materials.append(mat);return obj
    body=plate(kind+' traced body',p['body'],-.36,.40,finish,.002)
    if kind=='335':line('Cream body binding',p['body']+[p['body'][0]],-.385,.0015,cream)
    nx,ny=p['nut'];hx,hy=p['heel']
    plate('Tapered neck',[(nx-21,ny),(nx+21,ny),(hx+31,hy),(hx-31,hy)],-.37,.20,maple,.0006)
    plate('Fretboard',[(nx-20,ny),(nx+20,ny),(hx+29,hy),(hx-29,hy)],-.40,-.37,maple if kind=='tele' else rose)
    plate('Shaped headstock',p['head'],-.28,.16,black if kind=='335' else maple,.0007)
    guardmat=black if kind!='mustang' else material('Mustang pearl pickguard',(.86,.79,.73))
    plate('Photo-traced pickguard',p['guard'],-.41,-.37,guardmat,.0004)
    if kind=='335':line('Pickguard fine binding',p['guard']+[p['guard'][0]],-.425,.0007,cream)
    bx,by=p['bridge'];scale=by-ny
    for i in range(1,p['frets']+1):
        y=ny+scale*(1-2**(-i/12));t=(y-ny)/(hy-ny);x=nx+(hx-nx)*t;half=20+9*t
        line('Fret',[(x-half,y),(x+half,y)],-.425,.00045,chrome)
        if i in (3,5,7,9,12,15,17,19,21):
            prev=ny+scale*(1-2**(-(i-1)/12));yy=(prev+y)/2
            for offset in (-9,9) if i==12 else (0,):disc('Fret marker',x+offset,yy,3,-.43,-.426,black if kind=='tele' else cream)
    rect('Nut',nx,ny,43,4,-.445,-.38,cream)
    if kind=='tele':
        rect('Neck pickup chrome',645,858,79,15,-.48,-.42,chrome)
        rect('Bridge plate',646,1027,96,108,-.46,-.38,chrome)
        plate('Angled bridge single-coil',[(605,984),(614,977),(690,1005),(686,1022),(606,997)],-.51,-.47,black)
        for x in (619,641,663):rect('Brass saddle',x,1060,21,11,-.56,-.47,gold)
        plate('Chrome control plate',[(744,974),(756,968),(769,974),(775,992),(775,1144),(768,1164),(756,1168),(743,1160),(738,1144),(738,992)],-.46,-.38,chrome)
        for y in (1060,1140):disc('Tele knob',756,y,13,-.60,-.47,chrome)
        rect('Selector slot',755,1009,5,34,-.48,-.46,black);disc('Selector tip',754,1013,8,-.61,-.48,black,13)
    elif kind=='mustang':
        plate('Mustang chrome control plate',[(493,985),(518,977),(542,1000),(568,1050),(583,1093),(577,1116),(560,1123),(542,1115),(522,1080),(497,1040),(476,1020)],-.44,-.38,chrome)
        for x,y in [(515,1010),(545,1053)]:disc('Black bass knob',x,y,14,-.62,-.45,black)
        disc('Output socket',562,1092,8,-.46,-.44,black)
        for x,y in [(398,940),(437,966)]:
            plate('Mustang split pickup',[(x-22,y-11),(x+19,y-11),(x+27,y-5),(x+27,y+6),(x+18,y+12),(x-22,y+12),(x-28,y+5),(x-28,y-4)],-.50,-.43,black)
        rect('Mustang bridge',421,1140,110,104,-.47,-.38,chrome)
        for x in (392,412,432,452):rect('Bass saddle',x,1153,15,31,-.57,-.48,chrome)
        rect('Thumb rest',350,885,18,70,-.54,-.43,black)
    else:
        for y in (786,911):
            rect('Pickup mounting ring',620,y,99,59,-.44,-.39,black)
            rect('Nickel humbucker',620,y,79,47,-.51,-.44,chrome)
            for i in range(6):disc('Pickup pole',589+i*12,y-14,2,-.525,-.51,chrome)
        rect('Tune-o-matic bridge',618,957,96,15,-.58,-.45,chrome)
        rect('Stopbar tailpiece',617,1008,104,17,-.57,-.43,chrome)
        f=[(530,913),(520,914),(512,929),(503,953),(499,972),(489,988),(490,1010),(481,1040),(472,1063),(462,1068),(458,1060),(463,1052),(471,1055),(480,1035),(488,1003),(488,980),(498,961),(507,934),(516,915),(524,909)]
        plate('Left f-hole',f,-.382,-.38,black)
        plate('Right f-hole',[(1260-x,y) for x,y in f],-.382,-.38,black)
        for x,y in [(800,1029),(741,1074),(821,1106),(767,1151)]:disc('Amber control knob',x,y,14,-.55,-.40,gold)
        disc('Toggle washer',727,1018,8,-.43,-.39,cream);disc('Toggle tip',727,1018,3,-.58,-.44,cream)
    strings=4 if kind=='mustang' else 6
    for i in range(strings):
        t=i/(strings-1)-.5
        line('String '+str(i+1),[(bx+t*(62 if strings==4 else 61),by),(nx+t*35,ny),(nx+t*35,ny-32)],-.60,.00030 if strings==6 else .0005,chrome)
    if kind=='335':
        tuners=[(601,61),(599,98),(597,135),(679,60),(675,96),(672,135)]
    elif kind=='mustang':tuners=[(410,85),(399,130),(390,178),(378,221)]
    else:tuners=[(657,87),(648,113),(638,139),(630,164),(623,191),(616,216)]
    for i,(x,y) in enumerate(tuners):
        side=1 if kind=='335' and i>=3 else -1
        disc('Tuner post',x,y,5,-.38,-.28,chrome)
        rect('Tuner stem',x+side*18,y,29,4,-.02,.06,chrome)
        disc('Tuning key',x+side*31,y,14 if kind=='mustang' else 9,-.07,.08,cream if kind=='335' else chrome,11 if kind=='mustang' else 8)
    root.display_type='WIRE';root.hide_render=True;root['swell_visual_version']=3
    root['swell_instrument_style']=kind
    root['swell_model_reference']='User-supplied '+{'tele':'telecaster .jpeg','mustang':'mustang bass .jpeg','335':'335 .jpeg'}[kind]+'; hand-traced low-poly geometry, no photo texture.'
