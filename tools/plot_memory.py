"""Plot two completed traces with ReportLab's chart library (optional authoring tool).

python plot_memory.py BASELINE_JSON CURRENT_JSON OUTPUT_SVG
No dependency is added to the game or the standard-library planning validator.
"""
from pathlib import Path
import json
import math
import sys
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.graphics import renderSVG
from reportlab.lib.colors import HexColor

baseline_path, current_path, output = map(Path, sys.argv[1:])
traces = [json.loads(path.read_text()) for path in (baseline_path, current_path)]
for trace in traces:
    if trace['mode'] != 'memory' or trace['durationSeconds'] < 1800:
        raise ValueError('Use completed thirty-minute memory traces')
    if any(sample['heapBytes'] is None for sample in trace['samples']):
        raise ValueError('This comparison requires heap samples in both traces')

ink = HexColor('#e6e4d7')
muted = HexColor('#aebbb8')
teal = HexColor('#83cbbb')
gold = HexColor('#dbc08a')
red = HexColor('#e79a87')
background = HexColor('#101d22')
width, height = 1200, 840
drawing = Drawing(width, height)
drawing.add(Rect(0, 0, width, height, fillColor=background, strokeColor=None))
drawing.add(String(64, 792, 'THREEFOLD / BROWSER MEMORY CHECKPOINT', fontName='Helvetica-Bold', fontSize=22, fillColor=ink))
drawing.add(String(64, 765, 'Thirty minutes each. One sample per second. Shading marks the synthetic crowd being loaded.', fontSize=13, fillColor=muted))
maximum = max(sample['heapBytes']/2**20 for trace in traces for sample in trace['samples'])
ymax = max(450, math.ceil(maximum/150)*150)
titles = ['Before the environment repair', 'Revised environment and collision alignment']
for index, (trace, title, colour) in enumerate(zip(traces, titles, [gold, teal])):
    bottom = 462 if index == 0 else 157
    x, y, w, h = 105, bottom, 1030, 215
    drawing.add(String(64, bottom+253, title, fontName='Helvetica-Bold', fontSize=17, fillColor=ink))
    peak = max(sample['heapBytes']/2**20 for sample in trace['samples'])
    unloaded = [sample for sample in trace['samples'] if sample['phase'] == 'unloaded']
    growth = max((unloaded[-1][key]-trace['baseline'][key])/max(1,trace['baseline'][key])*100
                 for key in ['meshes','textures','materials','skeletons','animationGroups'])
    drawing.add(String(64, bottom+233, f'Peak estimate {peak:.1f} MiB  /  final retained-count growth {growth:.2f}%  /  hidden samples {trace["summary"]["hiddenSamples"]}', fontSize=12, fillColor=muted))
    for minute in range(1, 30, 2):
        drawing.add(Rect(x+w*minute/30, y, w/30, h, fillColor=HexColor('#193137'), strokeColor=None))
    plot = LinePlot()
    plot.x, plot.y, plot.width, plot.height = x, y, w, h
    plot.data = [[(sample['elapsed']/60, sample['heapBytes']/2**20) for sample in trace['samples']]]
    plot.lines[0].strokeColor = colour
    plot.lines[0].strokeWidth = 1.35
    plot.xValueAxis.valueMin, plot.xValueAxis.valueMax = 0, 30
    plot.xValueAxis.valueSteps = list(range(0, 31, 5))
    plot.yValueAxis.valueMin, plot.yValueAxis.valueMax = 0, ymax
    plot.yValueAxis.valueSteps = list(range(0, ymax+1, 150))
    for axis in (plot.xValueAxis, plot.yValueAxis):
        axis.strokeColor = HexColor('#4b6166')
        axis.labels.fillColor = muted
        axis.labels.fontSize = 10
    plot.yValueAxis.visibleGrid = True
    plot.yValueAxis.gridStrokeColor = HexColor('#33484d')
    plot.yValueAxis.gridStrokeWidth = .4
    drawing.add(plot)
    target_y = y+h*300/ymax
    drawing.add(Line(x, target_y, x+w, target_y, strokeColor=red, strokeWidth=1, strokeDashArray=[5,4]))
    drawing.add(String(x+w-4, target_y+6, '300 MiB target', textAnchor='end', fontSize=10, fillColor=red))
    drawing.add(String(64, y+h+2, 'MiB', fontSize=10, fillColor=muted))
    drawing.add(String(x+w, y-30, 'Elapsed minutes', textAnchor='end', fontSize=10, fillColor=muted))

drawing.add(String(64, 78, 'Chromium performance.memory is an approximate heap estimate, not isolated process or GPU memory.', fontSize=12, fillColor=muted))
drawing.add(String(64, 56, 'The workload creates/disposes synthetic crowd instances; it does not perform real zone transfers or force garbage collection.', fontSize=12, fillColor=muted))
output.parent.mkdir(parents=True, exist_ok=True)
renderSVG.drawToFile(drawing, str(output))
svg = output.read_text().replace('<title>...</title>', '<title>THREEFOLD browser memory comparison</title>', 1)
svg = svg.replace('<desc>...</desc>', '<desc>Two thirty-minute heap traces with alternating crowd load cycles, a 300 MiB target line, and retained resource-count growth reported for each run.</desc>', 1)
output.write_text(svg)
print(json.dumps({'output': str(output), 'width': width, 'height': height,
                  'sources': [str(baseline_path), str(current_path)], 'heap_axis_max_mib': ymax}))
