"""Separate coincident orthogonal floor runs; coordinates are Blender units."""


def separate_routes(routes, gap, tolerance=1e-5):
    """Return floor polylines keyed by ID, retaining the exact endpoint positions.

    Each route has id, points, radius and source (XY sorting key). Shared runs
    form bundles with stable source order. Opposite traversal reverses the lane
    normal, so a cable's source/target direction does not reverse its lane.
    """
    paths = {}
    segments = []
    for route in routes:
        clean = []
        for point in route['points']:
            p = tuple(point)
            if not clean or sum((a-b)**2 for a,b in zip(p[:2], clean[-1][:2])) > tolerance**2:
                clean.append(p)
        # Remove redundant collinear points before joining shifted corners.
        simplified = []
        for p in clean:
            while len(simplified) > 1:
                a,b = simplified[-2:]
                u=(b[0]-a[0], b[1]-a[1]); v=(p[0]-b[0], p[1]-b[1])
                if abs(u[0]*v[1]-u[1]*v[0]) > tolerance or u[0]*v[0]+u[1]*v[1] <= 0:
                    break
                simplified.pop()
            simplified.append(p)
        paths[route['id']] = simplified
        for i,(a,b) in enumerate(zip(simplified, simplified[1:])):
            axis = 0 if abs(a[1]-b[1]) <= tolerance else 1
            segments.append({'id':route['id'], 'i':i, 'axis':axis,
                             'fixed':a[1-axis], 'lo':min(a[axis],b[axis]),
                             'hi':max(a[axis],b[axis]), 'direction':1 if b[axis]>a[axis] else -1})
    adjacency = {r['id']:[] for r in routes}
    shared = set()
    for i,a in enumerate(segments):
        for b in segments[i+1:]:
            if a['id']==b['id'] or a['axis']!=b['axis'] or abs(a['fixed']-b['fixed']) > tolerance:
                continue
            if min(a['hi'],b['hi'])-max(a['lo'],b['lo']) <= tolerance:
                continue  # A crossing or touching endpoints is not a shared run.
            shared.update(((a['id'],a['i']), (b['id'],b['i'])))
            parity=a['direction']*b['direction']
            adjacency[a['id']].append((b['id'],parity))
            adjacency[b['id']].append((a['id'],parity))
    by_id={r['id']:r for r in routes}
    order=lambda key: (*by_id[key]['source'][:2], key)
    offsets={}; orientations={}
    for root in sorted(by_id, key=order):
        if root in orientations: continue
        orientations[root]=1; pending=[root]; group=[]
        while pending:
            key=pending.pop(); group.append(key)
            for other,parity in sorted(adjacency[key]):
                if other not in orientations:
                    orientations[other]=orientations[key]*parity; pending.append(other)
        group.sort(key=order)
        width=sum(2*by_id[key]['radius'] for key in group)+gap*(len(group)-1)
        cursor=-width/2
        for key in group:
            radius=by_id[key]['radius']; offsets[key]=cursor+radius
            cursor+=2*radius+gap
    output={}
    for key,points in paths.items():
        if len(points)<2:
            output[key]=points; continue
        shifted=[]
        for i,(a,b) in enumerate(zip(points,points[1:])):
            dx=b[0]-a[0]; dy=b[1]-a[1]; length=(dx*dx+dy*dy)**.5
            distance=offsets[key]*orientations[key] if (key,i) in shared else 0
            nx=-dy/length*distance; ny=dx/length*distance
            shifted.append(((a[0]+nx,a[1]+ny,a[2]), (b[0]+nx,b[1]+ny,b[2])))
        result=[points[0],shifted[0][0]]
        for previous,current in zip(shifted,shifted[1:]):
            a,b=previous; c,d=current
            # Orthogonal miter preserves parallel lanes through a bend.
            if abs(a[1]-b[1]) <= tolerance and abs(c[0]-d[0]) <= tolerance:
                result.append((c[0],b[1],b[2]))
            elif abs(a[0]-b[0]) <= tolerance and abs(c[1]-d[1]) <= tolerance:
                result.append((b[0],c[1],b[2]))
            else:
                result.extend((b,c))
        result.extend((shifted[-1][1],points[-1]))
        output[key]=result
    return output
