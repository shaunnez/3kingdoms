"""Export checked-in Blender sources without contacting a generation provider.

blender --background --python-exit-code 1 --python tools/export_authored.py -- knight
Run pack_assets.mjs separately after reviewing the unoptimized exports.
"""
from pathlib import Path
import sys
import bpy

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {"briar-gate", "knight", "cyborg", "wolf", "mara", "nemi"}
names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not names or any(name not in ALLOWED for name in names):
    raise ValueError("Choose one or more checked-in models: " + ", ".join(sorted(ALLOWED)))

for name in names:
    source = ROOT / "assets" / "source" / f"{name}.blend"
    if not source.is_file():
        raise FileNotFoundError(source)
    output = ROOT / "assets" / "source" / "private" / "authored-exports" / f"{name}.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    options = dict(filepath=str(output), export_format="GLB", export_yup=True,
                   export_cameras=False, export_lights=False, export_tangents=True)
    if name == "briar-gate":
        options.update(export_apply=True, export_animations=False)
    else:
        options.update(export_animations=True, export_animation_mode="NLA_TRACKS",
                       export_nla_strips=True, export_force_sampling=True)
    bpy.ops.export_scene.gltf(**options)
    print(f"Exported {name}: {output.stat().st_size} bytes to {output}")
