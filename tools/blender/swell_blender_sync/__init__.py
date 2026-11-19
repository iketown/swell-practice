bl_info = {
    "name": "The Swell Setup Sync",
    "author": "The Swell",
    "version": (0, 3, 1),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar > Swell",
    "description": "Sync Swell equipment, dimensions and live cable routes",
    "category": "3D View",
}

import json
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime

import bpy
from bpy.props import PointerProperty, StringProperty
from bpy.types import Operator, Panel, PropertyGroup


def stage_object_poll(_settings, obj):
    return obj is not None and obj.type == "MESH"


def projected_stage_outline(context, obj):
    depsgraph = context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        if not mesh.vertices:
            raise ValueError("The stage object has no vertices.")

        matrix = evaluated.matrix_world
        points = [(matrix @ vertex.co).xy[:] for vertex in mesh.vertices]
        if len(mesh.polygons) == 1:
            ordered = [points[index] for index in mesh.polygons[0].vertices]
        else:
            ordered = convex_hull(points)

        if len(ordered) < 3:
            raise ValueError("The stage object needs at least three outline points.")

        scale_length = context.scene.unit_settings.scale_length or 1.0
        ordered_meters = [(point[0] * scale_length, point[1] * scale_length) for point in ordered]
        min_x = min(point[0] for point in ordered_meters)
        max_x = max(point[0] for point in ordered_meters)
        min_y = min(point[1] for point in ordered_meters)
        max_y = max(point[1] for point in ordered_meters)
        width_meters = max_x - min_x
        depth_meters = max_y - min_y
        if width_meters <= 0 or depth_meters <= 0:
            raise ValueError("The stage object must have non-zero X and Y dimensions.")

        # Blender +Y becomes the app's backstage edge, whose Y coordinate starts at zero.
        outline = [
            {
                "xMeters": round(point[0] - min_x, 6),
                "yMeters": round(max_y - point[1], 6),
            }
            for point in ordered_meters
        ]
        return round(width_meters, 6), round(depth_meters, 6), outline
    finally:
        evaluated.to_mesh_clear()


def convex_hull(points):
    unique = sorted(set((float(point[0]), float(point[1])) for point in points))
    if len(unique) <= 1:
        return unique

    def cross(origin, first, second):
        return (
            (first[0] - origin[0]) * (second[1] - origin[1])
            - (first[1] - origin[1]) * (second[0] - origin[0])
        )

    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


class SWELL_PG_setup_sync(PropertyGroup):
    setup_id: StringProperty(
        name="Setup ID",
        description="The ID at the end of the Swell setup URL",
    )
    app_url: StringProperty(
        name="App URL",
        description="Base URL for The Swell app",
        default="http://localhost:3000",
    )
    stage_object: PointerProperty(
        name="Stage Object",
        description="Mesh whose XY perimeter defines the stage floor",
        type=bpy.types.Object,
        poll=stage_object_poll,
    )
    sync_token: StringProperty(
        name="Sync Token",
        description="Optional token for a non-local or production sync endpoint",
        subtype="PASSWORD",
    )
    last_sync: StringProperty(name="Last Sync", default="")


class SWELL_OT_push_stage_to_setup(Operator):
    bl_idname = "swell.push_stage_to_setup"
    bl_label = "Push to Setup"
    bl_description = "Send the selected stage object's dimensions and perimeter to the linked Swell setup"
    bl_options = {"REGISTER"}

    def execute(self, context):
        settings = context.scene.swell_setup_sync
        setup_id = settings.setup_id.strip()
        app_url = settings.app_url.strip().rstrip("/")
        stage_object = settings.stage_object

        if not setup_id or any(character in setup_id for character in "/?#"):
            self.report({"ERROR"}, "Enter a valid setup ID.")
            return {"CANCELLED"}
        if not app_url.startswith(("http://", "https://")):
            self.report({"ERROR"}, "App URL must begin with http:// or https://.")
            return {"CANCELLED"}
        if stage_object is None or stage_object.type != "MESH":
            self.report({"ERROR"}, "Choose a mesh as the stage object.")
            return {"CANCELLED"}

        try:
            width_meters, depth_meters, outline = projected_stage_outline(context, stage_object)
            payload = {
                "schemaVersion": 1,
                "source": {
                    "blendFile": bpy.data.filepath,
                    "objectName": stage_object.name,
                    "sceneName": context.scene.name,
                },
                "stage": {
                    "widthMeters": width_meters,
                    "depthMeters": depth_meters,
                    "outlineMeters": outline,
                },
            }
            endpoint = (
                f"{app_url}/api/setups/"
                f"{urllib.parse.quote(setup_id, safe='')}/blender-sync"
            )
            headers = {
                "Content-Type": "application/json",
                "X-Swell-Blender-Local": "1",
            }
            if settings.sync_token:
                headers["X-Swell-Blender-Token"] = settings.sync_token
            request = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            try:
                response = json.loads(error.read().decode("utf-8"))
                message = response.get("error", str(error))
            except (json.JSONDecodeError, UnicodeDecodeError):
                message = str(error)
            self.report({"ERROR"}, f"Push failed: {message}")
            return {"CANCELLED"}
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.report({"ERROR"}, f"Push failed: {error}")
            return {"CANCELLED"}

        revision = result.get("revision", "?")
        settings.last_sync = (
            f"{datetime.now().strftime('%H:%M:%S')} · "
            f"{width_meters:.3f} × {depth_meters:.3f} m · revision {revision}"
        )
        self.report({"INFO"}, "Stage pushed. Reload the setup page to see it.")
        return {"FINISHED"}


class SWELL_OT_open_setup(Operator):
    bl_idname = "swell.open_setup"
    bl_label = "Open Setup"
    bl_description = "Open the linked setup in a web browser"

    def execute(self, context):
        settings = context.scene.swell_setup_sync
        setup_id = settings.setup_id.strip()
        if not setup_id:
            self.report({"ERROR"}, "Enter a setup ID.")
            return {"CANCELLED"}
        webbrowser.open(f"{settings.app_url.rstrip('/')}/setups/{urllib.parse.quote(setup_id, safe='')}")
        return {"FINISHED"}


class SWELL_PT_setup_sync(Panel):
    bl_label = "Setup Sync"
    bl_idname = "SWELL_PT_setup_sync"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Swell"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.swell_setup_sync
        layout.prop(settings, "setup_id")
        layout.prop(settings, "stage_object")

        push_row = layout.row()
        push_row.scale_y = 1.35
        push_row.enabled = bool(settings.setup_id.strip() and settings.stage_object)
        push_row.operator("swell.push_stage_to_setup", icon="EXPORT")

        layout.operator("swell.open_setup", icon="URL")
        if settings.last_sync:
            box = layout.box()
            box.label(text="Last push")
            box.label(text=settings.last_sync, icon="CHECKMARK")

        advanced = layout.box()
        advanced.label(text="Connection")
        advanced.prop(settings, "app_url")
        advanced.prop(settings, "sync_token")


CLASSES = (
    SWELL_PG_setup_sync,
    SWELL_OT_push_stage_to_setup,
    SWELL_OT_open_setup,
    SWELL_PT_setup_sync,
)


def register():
    from . import equipment
    equipment.register()
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.swell_setup_sync = PointerProperty(type=SWELL_PG_setup_sync)


def unregister():
    from . import equipment
    equipment.unregister()
    del bpy.types.Scene.swell_setup_sync
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
