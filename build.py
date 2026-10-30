#!/usr/bin/env python3
"""Bundle src/ into the single-file tile-planner.html.

src/index.html loads src/main.js as an ES module, which works when served over HTTP
(e.g. `python3 -m http.server`, then open /src/). Browsers don't load module files from
file://, so this script inlines every module into one <script type="module"> that opens
by double-click.

Modules are concatenated in dependency order (imports first) into one scope: import lines
are dropped and `export` keywords removed. That works because top-level names are unique
across modules (checked here) and cross-module code at load time only uses modules that
come earlier. Only single-name `export function|const|let|class` and `import { a, b } from
'./x.js'` are supported.

Usage: python3 build.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'tile-planner.html')
ENTRY_TAG = '<script type="module" src="main.js"></script>'

IMPORT_RE = re.compile(r"^import\s*\{[^}]*\}\s*from\s*'([^']+)';[ \t]*\n", re.M)
EXPORT_RE = re.compile(r'^export (?=(?:async )?function |const |let |class )', re.M)
TOP_DECL_RE = re.compile(r'^(?:async )?(?:function\*? |const |let |class )(\w+)', re.M)


def fail(msg):
    sys.exit(f'build.py: {msg}')


def load_order(entry):
    """Depth-first post-order from the entry module: each module after its imports."""
    order, state = [], {}

    def visit(path):
        if state.get(path) == 'done' or state.get(path) == 'visiting':
            return  # a cycle is fine as long as nothing runs at load time across it
        state[path] = 'visiting'
        text = open(path, encoding='utf-8').read()
        if re.search(r'^\s*export\s*(\{|default|\*)', text, re.M):
            fail(f'{os.path.relpath(path, SRC)}: only `export function|const|let|class` is supported')
        for spec in IMPORT_RE.findall(text):
            dep = os.path.normpath(os.path.join(os.path.dirname(path), spec))
            if not os.path.isfile(dep):
                fail(f'{os.path.relpath(path, SRC)}: cannot resolve {spec}')
            visit(dep)
        state[path] = 'done'
        order.append((path, text))

    visit(entry)
    return order


def strip_comments_and_strings(code):
    code = re.sub(r'/\*.*?\*/', ' ', code, flags=re.S)
    code = re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"", "''", code)
    return re.sub(r'//.*', '', code)


def missing_imports(order):
    """Names another module declares at top level that a module uses without importing or
    declaring them. The bundle shares one scope, so these only fail when served from src/.
    Heuristic: a name counts as declared if it appears in any const/let/var/function or
    parameter list in the module."""
    top = {path: set(TOP_DECL_RE.findall(EXPORT_RE.sub('', text))) for path, text in order}
    problems = []
    for path, text in order:
        imported = {n.strip() for group in re.findall(r"^import\s*\{([^}]*)\}", text, re.M) for n in group.split(',')}
        code = strip_comments_and_strings(IMPORT_RE.sub('', text))
        local = set(re.findall(r'\b(?:const|let|var|function)\s+(\w+)', code))
        for decl in re.findall(r'\b(?:const|let|var)\s*[\[{]([^=]*)[\]}]\s*=', code):  # destructuring
            local.update(re.findall(r'\w+', decl))
        param_lists = (
            re.findall(r'\bfunction\s*\w*\s*\(([^()]*)\)', code)                        # function f(a, b)
            + re.findall(r'\(([^()]*)\)\s*=>', code)                                     # (a, b) =>
            + re.findall(r'(\w+)\s*=>', code)                                            # a =>
            + re.findall(r'^\s*(?:get |set )?(?!(?:if|for|while|switch|catch)\b)\w+\s*\(([^()]*)\)\s*\{', code, re.M)  # methods
            + re.findall(r'\bcatch\s*\(([^()]*)\)', code)
        )
        for params in param_lists:
            local.update(re.findall(r'[A-Za-z_$][\w$]*', params))
        for other, names in top.items():
            if other == path:
                continue
            for name in names - imported - local:
                if re.search(r'(?<![\w$])(?<![^.]\.)' + re.escape(name) + r'\b', code):
                    problems.append(f'{os.path.relpath(path, SRC)} uses `{name}` from {os.path.relpath(other, SRC)} without importing it')
    return problems


def bundle(order):
    owners, parts = {}, []
    for path, text in order:
        rel = os.path.relpath(path, SRC)
        code = EXPORT_RE.sub('', IMPORT_RE.sub('', text))
        if re.search(r'^\s*(import|export)\b', code, re.M):
            fail(f'{rel}: unsupported import/export form')
        for name in TOP_DECL_RE.findall(code):
            if name in owners:
                fail(f'top-level name `{name}` is declared in both {owners[name]} and {rel}')
            owners[name] = rel
        parts.append(f'// ---- src/{rel} ----\n{code.strip()}\n')
    code = '\n'.join(parts)
    # Indent to sit inside <script> like the hand-written file did
    return '\n'.join(('        ' + line) if line.strip() else '' for line in code.split('\n'))


def main():
    html = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
    if html.count(ENTRY_TAG) != 1:
        fail(f'src/index.html must contain {ENTRY_TAG} exactly once')
    order = load_order(os.path.join(SRC, 'main.js'))
    problems = missing_imports(order)
    if problems:
        fail('missing imports (the bundle would work, src/ would not):\n  ' + '\n  '.join(problems))
    js = bundle(order)
    banner = '<!-- Built by build.py from src/. Edit src/ and rebuild; do not edit this file. -->\n'
    html = html.replace(ENTRY_TAG, f'<script type="module">\n{js.rstrip()}\n    </script>')
    html = re.sub(r'^(<!DOCTYPE html>\n)', lambda m: m.group(1) + banner, html, count=1, flags=re.I)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'wrote {os.path.relpath(OUT, ROOT)} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
