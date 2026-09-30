"""Summarize a saved browser load/unload trace without hiding heap peaks.

python3 tools/summarize_memory.py TRACE_JSON BUILD_MANIFEST_JSON OUTPUT_JSON
The manifest association is supplied by the operator of the frozen preview.
"""
from pathlib import Path
import hashlib
import json
import sys

trace_path, manifest_path, output = map(Path, sys.argv[1:])
trace = json.loads(trace_path.read_text())
manifest = json.loads(manifest_path.read_text())
if trace['mode'] != 'memory':
    raise ValueError('Expected a memory load/unload trace')
samples = trace['samples']
first_loaded = next((i for i, sample in enumerate(samples) if sample['phase'] == 'loaded'), None)
if first_loaded is None:
    raise ValueError('No loaded samples; this trace cannot establish disposal behavior')
# Sampling precedes the phase switch. Exclude the one pre-load transition sample.
post_load_samples = samples[first_loaded + 1:]
unloaded = [sample for sample in post_load_samples if sample['phase'] == 'unloaded']
if not unloaded:
    raise ValueError('No unloaded samples; this trace cannot establish resource retention')
resources = {}
for key in ['meshes', 'textures', 'materials', 'skeletons', 'animationGroups']:
    baseline = trace['baseline'][key]
    last = unloaded[-1][key]
    resources[key] = {
        'baseline': baseline,
        'unloaded_min': min(sample[key] for sample in unloaded),
        'unloaded_max': max(sample[key] for sample in unloaded),
        'last_unloaded': last,
        'last_growth_percent': (last-baseline)/max(1,baseline)*100,
    }
heap = sorted(sample['heapBytes'] for sample in samples if sample['heapBytes'] is not None)
groups = sum(sample['phase'] == 'unloaded' and
             (i == 0 or post_load_samples[i-1]['phase'] != 'unloaded')
             for i, sample in enumerate(post_load_samples))
result = {
    'trace': str(trace_path),
    'trace_sha256': hashlib.sha256(trace_path.read_bytes()).hexdigest(),
    'manifest': str(manifest_path),
    'fingerprint': manifest['fingerprint'],
    'build_association': 'Operator-associated frozen preview; source fingerprint is not embedded in the browser trace.',
    'duration_seconds': trace['durationSeconds'],
    'hidden_samples': trace['summary']['hiddenSamples'],
    'unloaded_phases': groups,
    'unloaded_phase_definition': 'Consecutive unloaded samples after the first measured loaded phase. Excludes the pre-load transition sample; final cleanup after recording has no subsequent sample.',
    'resources': resources,
    'heap_mib': {
        'min': min(heap)/2**20, 'max': max(heap)/2**20,
        'median': heap[(len(heap)-1)//2]/2**20,
        'p95': heap[int((len(heap)-1)*.95)]/2**20,
        'first_unloaded': unloaded[0]['heapBytes']/2**20,
        'last_unloaded': unloaded[-1]['heapBytes']/2**20,
    } if heap else None,
    'retained_count_check': 'passed' if trace['durationSeconds'] >= 1800 and
        trace['summary']['hiddenSamples'] == 0 and groups >= 14 and
        all(value['last_growth_percent'] < 5 for value in resources.values()) else 'not-passed',
    'heap_300mib_target': 'not-measured' if not heap else 'met' if max(heap) <= 300*2**20 else 'exceeded',
    'limitations': [
        'Synthetic crowd creation/disposal, not six real zone round trips.',
        'Chromium performance.memory heap samples are not GPU memory measurements.',
        'performance.memory is a legacy estimate that can include shared heaps or omit separate heaps; this is not isolated process-memory attribution.',
        'No forced garbage collection; peaks and settled resource counts are both retained.',
    ],
    'measurement_reference': 'https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory',
}
output.write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
