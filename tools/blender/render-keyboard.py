import bpy
from pathlib import Path
scene=bpy.context.scene
scene.render.filepath='/Users/brianeichenberger/projects/the_swell/stage/keyboard_stage_center.png'
scene.cycles.samples=24
bpy.ops.render.render(write_still=True)
