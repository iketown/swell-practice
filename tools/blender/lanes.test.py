import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('lanes',Path(__file__).parent/'swell_blender_sync/lanes.py')
lanes=importlib.util.module_from_spec(spec); spec.loader.exec_module(lanes)


def route(key,points,radius=.003,source=None):
    return dict(id=key,points=[(x,y,0) for x,y in points],radius=radius,source=source or points[0])


class LaneTests(unittest.TestCase):
    def test_five_cables_clearance_and_stable_order(self):
        routes=[route(str(i),[(0,0),(3,0)],.002+i*.0002,(-i,0)) for i in range(5)]
        result=lanes.separate_routes(routes,.00635)
        self.assertEqual(result,lanes.separate_routes(list(reversed(routes)),.00635))
        ordered=sorted(routes,key=lambda r:result[r['id']][1][1])
        for a,b in zip(ordered,ordered[1:]):
            self.assertAlmostEqual(result[b['id']][1][1]-result[a['id']][1][1]-a['radius']-b['radius'],.00635)
        for r in routes:
            self.assertEqual(result[r['id']][0],r['points'][0])
            self.assertEqual(result[r['id']][-1],r['points'][-1])

    def test_opposite_direction(self):
        result=lanes.separate_routes([route('a',[(0,0),(3,0)]),route('b',[(3,0),(0,0)])],.00635)
        self.assertAlmostEqual(abs(result['a'][1][1]-result['b'][1][1]),.01235)

    def test_corner_nested_lanes(self):
        for corner in ([(0,2),(0,0),(2,0)],[(0,0),(0,2),(2,2)]):
            result=lanes.separate_routes([route('a',corner),route('b',corner)],.00635)
            a,b=result['a'][2],result['b'][2]
            self.assertAlmostEqual(abs(a[0]-b[0]),.01235)
            self.assertAlmostEqual(abs(a[1]-b[1]),.01235)
            # Opposite signs for the normal components are required for the upper bend.
            self.assertEqual((a[0]-b[0])*(a[1]-b[1])>0,corner[0][1]==2)

    def test_partial_overlap(self):
        result=lanes.separate_routes([route('a',[(0,0),(5,0)]),route('b',[(2,0),(4,0)])],.00635)
        self.assertAlmostEqual(abs(result['a'][1][1]-result['b'][1][1]),.01235)

    def test_crossings_and_disjoint_runs_unchanged(self):
        routes=[route('a',[(0,0),(2,0)]),route('b',[(1,-1),(1,1)]),route('c',[(3,0),(4,0)])]
        result=lanes.separate_routes(routes,.00635)
        for r in routes:
            self.assertTrue(all(p in r['points'] for p in result[r['id']]))

    def test_degenerate_and_scale(self):
        self.assertEqual(lanes.separate_routes([route('a',[(0,0),(0,0)])],.00635)['a'],[(0,0,0)])
        routes=[route('a',[(0,0),(300,0)],.3),route('b',[(0,0),(300,0)],.3)]
        result=lanes.separate_routes(routes,.635)
        self.assertAlmostEqual(abs(result['a'][1][1]-result['b'][1][1]),1.235)

if __name__=='__main__': unittest.main()
