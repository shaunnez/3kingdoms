"""Resume known Meshy jobs and collect artifacts. This script never submits paid jobs."""
import concurrent.futures
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'assets/source/private/meshy'
CLI=['npm','exec','--yes','--package=meshy-cli@0.4.0','--','meshy']
COMMON=['--workspace',str(PRIVATE),'--output-schema','v1','--format','json','--no-update-check']

def command(arguments,receipt):
    result=subprocess.run(CLI+arguments+COMMON,cwd=ROOT,capture_output=True,text=True,timeout=720)
    receipt.write_text(result.stdout)
    if result.returncode:
        raise RuntimeError(f'{receipt.name}: CLI exited {result.returncode}; inspect private receipt')
    parsed=json.loads(result.stdout)
    if not parsed.get('ok'):raise RuntimeError(f'{receipt.name}: provider returned failure')
    return parsed

def collect(job):
    project=PRIVATE/job['project']
    result=command([job['resource'],'wait',job['id'],'--timeout','600','--project',str(project),'--stage',job['name']],project/(job['name']+'-wait.json'))
    task=result['result'].get('task') or {}
    task_file=project/('task_'+job['id']+'.json')
    command(['download','--task-json',str(task_file),'--asset',job['asset'],'--output',str(project/job['file']),'--project',str(project),'--stage','download'],project/(job['name']+'-download.json'))
    return {'name':job['name'],'id':job['id'],'status':task.get('status'),'file':job['file']}

if __name__=='__main__':
    jobs=json.loads(Path(sys.argv[1]).read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for future in concurrent.futures.as_completed([pool.submit(collect,job) for job in jobs]):
            print(json.dumps(future.result()),flush=True)
