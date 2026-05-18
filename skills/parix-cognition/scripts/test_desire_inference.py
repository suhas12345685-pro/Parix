#!/usr/bin/env python3
"""Smoke-test the desire inference module by sending a mock context payload."""

import json
import subprocess
import sys
import os

SCRIPT = """
const {{ DesireEngine }} = require('./atrium/dist/cognition/desire');

async function test() {{
  const engine = new DesireEngine();
  const context = {{
    recentActions: ['opened terminal', 'typed git status'],
    activeWindow: 'Terminal',
    clipboard: 'fix: resolve merge conflict',
    timeOfDay: 'morning',
    workingDir: '/home/user/project',
  }};

  try {{
    const result = await engine.infer(context);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.confidence > 0 ? 0 : 1);
  }} catch (e) {{
    console.error('Desire inference error:', e.message);
    process.exit(1);
  }}
}}

test();
"""


def main():
    # Write a temp script
    tmp = os.path.join(os.getcwd(), "_test_desire_tmp.js")
    try:
        with open(tmp, "w") as f:
            f.write(SCRIPT)
        result = subprocess.run(
            ["node", tmp], capture_output=True, text=True, timeout=15
        )
        print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


if __name__ == "__main__":
    main()
