import ast
import os
import re
from typing import Any

LANG_MAP = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".glsl": "glsl",
    ".frag": "glsl",
    ".vert": "glsl",
    ".sql": "sql",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".html": "html",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".rs": "rust",
    ".go": "go",
}

TS_IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]""")
TS_SYMBOL_RE = re.compile(
    r"""^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|interface|type|const)\s+([A-Za-z_][A-Za-z0-9_]*)""",
    re.MULTILINE,
)
GLSL_FUNC_RE = re.compile(r"""^\s*(?:void|float|vec2|vec3|vec4|mat3|mat4)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(""", re.MULTILINE)


def detect_language(file_path: str) -> str:
    _, ext = os.path.splitext(file_path.lower())
    return LANG_MAP.get(ext, "text")


def parse_python_file(file_path: str, content: str) -> dict[str, Any]:
    symbols: list[dict[str, Any]] = []
    imports: list[str] = []
    chunks: list[dict[str, Any]] = []
    complexity = 1.0
    lines = content.splitlines()

    try:
        tree = ast.parse(content)
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.ExceptHandler, ast.With)):
                complexity += 0.8
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                kind = "class" if isinstance(node, ast.ClassDef) else "function"
                start = getattr(node, "lineno", 1)
                end = getattr(node, "end_lineno", min(len(lines), start + 25))
                symbols.append({"name": node.name, "kind": kind, "line": start, "end_line": end})
                snippet = "\n".join(lines[max(0, start - 1) : end])
                chunks.append(
                    {
                        "file_path": file_path,
                        "start_line": start,
                        "end_line": end,
                        "symbol_name": f"{kind}:{node.name}",
                        "content": snippet[:2400],
                    }
                )
    except SyntaxError:
        pass

    if not chunks:
        chunks.extend(_chunk_lines(file_path, lines))

    return {
        "language": "python",
        "loc": len(lines),
        "symbols": symbols,
        "imports": sorted(set(imports)),
        "complexity": round(min(complexity, 35.0), 2),
        "chunks": chunks,
    }


def parse_generic_file(file_path: str, content: str, language: str) -> dict[str, Any]:
    lines = content.splitlines()
    symbols: list[dict[str, Any]] = []
    imports: list[str] = []

    if language in {"typescript", "tsx", "javascript", "jsx"}:
        imports = sorted(set(TS_IMPORT_RE.findall(content)))
        for match in TS_SYMBOL_RE.finditer(content):
            kind, name = match.group(1), match.group(2)
            line_no = content.count("\n", 0, match.start()) + 1
            symbols.append({"name": name, "kind": kind, "line": line_no, "end_line": min(len(lines), line_no + 30)})
    elif language == "glsl":
        for match in GLSL_FUNC_RE.finditer(content):
            name = match.group(1)
            line_no = content.count("\n", 0, match.start()) + 1
            symbols.append({"name": name, "kind": "shader_fn", "line": line_no, "end_line": min(len(lines), line_no + 25)})

    branch_hits = len(re.findall(r"\b(if|else|for|while|switch|catch|\?\?|\|\||&&)\b", content))
    complexity = round(min(1.0 + branch_hits * 0.45, 35.0), 2)
    chunks = _chunk_lines(file_path, lines, symbols=symbols)

    return {
        "language": language,
        "loc": len(lines),
        "symbols": symbols,
        "imports": imports,
        "complexity": complexity,
        "chunks": chunks,
    }


def _chunk_lines(file_path: str, lines: list[str], symbols: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if not lines:
        return [{"file_path": file_path, "start_line": 1, "end_line": 1, "symbol_name": "empty", "content": ""}]

    window = 45
    stride = 35
    chunks: list[dict[str, Any]] = []
    for idx in range(0, len(lines), stride):
        end = min(len(lines), idx + window)
        start_line = idx + 1
        sym_name = "module"
        if symbols:
            for s in symbols:
                if start_line <= s["line"] <= end:
                    sym_name = f"{s['kind']}:{s['name']}"
                    break
        chunks.append(
            {
                "file_path": file_path,
                "start_line": start_line,
                "end_line": end,
                "symbol_name": sym_name,
                "content": "\n".join(lines[idx:end])[:2400],
            }
        )
        if end >= len(lines):
            break
    return chunks


def parse_repository_file(file_path: str, content: str) -> dict[str, Any]:
    lang = detect_language(file_path)
    if lang == "python":
        return parse_python_file(file_path, content)
    return parse_generic_file(file_path, content, lang)
