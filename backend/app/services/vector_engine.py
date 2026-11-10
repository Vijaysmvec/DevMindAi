import hashlib
import json
import math
import re
from typing import Sequence

from ..config import settings

TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+")


def _split_camel_snake(identifier: str) -> list[str]:
    parts = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", identifier).replace("_", " ").lower().split()
    return [p for p in parts if p]


def compute_local_embedding(text: str, dim: int = settings.EMBEDDING_DIM) -> list[float]:
    """Deterministic semantic feature hashing over identifiers, sub-tokens, and bigrams."""
    vec = [0.0] * dim
    raw_tokens = TOKEN_RE.findall(text)
    expanded: list[str] = []
    for tok in raw_tokens[:1500]:
        low = tok.lower()
        expanded.append(low)
        sub = _split_camel_snake(tok)
        if len(sub) > 1:
            expanded.extend(sub)

    if not expanded:
        vec[0] = 1.0
        return vec

    for i, token in enumerate(expanded):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        weight = 1.35 if len(token) > 4 else 0.85
        vec[idx] += sign * weight

        if i + 1 < len(expanded):
            bigram = f"{token}:{expanded[i + 1]}"
            bdigest = hashlib.blake2b(bigram.encode("utf-8"), digest_size=8).digest()
            bidx = int.from_bytes(bdigest[:4], "little") % dim
            bsign = 1.0 if (bdigest[4] & 1) == 0 else -1.0
            vec[bidx] += bsign * 0.65

    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 1e-9:
        vec = [round(v / norm, 6) for v in vec]
    return vec


def embed_text(text: str, api_key: str | None = None) -> list[float]:
    """Compute unified 128-dim normalized identifier + bigram embedding so seeded and newly indexed chunks share a single vector space."""
    _ = api_key
    return compute_local_embedding(text, dim=settings.EMBEDDING_DIM)


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return dot / (na * nb)


def rank_by_similarity(query_vec: list[float], items: list[dict], top_k: int = 5) -> list[dict]:
    scored = []
    for item in items:
        emb = item.get("embedding")
        if isinstance(emb, str):
            try:
                emb = json.loads(emb)
            except Exception:
                emb = []
        score = cosine_similarity(query_vec, emb or [])
        scored.append({**item, "score": round(float(score), 4)})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
