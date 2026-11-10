import json
import secrets
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import hash_password
from .config import settings
from .models import (
    CodeChunk,
    MemoryNode,
    ModelTelemetry,
    RepoFile,
    Repository,
    SecurityScanRecord,
    User,
    UserVisualSettings,
)
from .services.code_parser import parse_repository_file
from .services.vector_engine import compute_local_embedding

STARTER_FILES = [
    {
        "path": "src/core/singularityEngine.ts",
        "content": """import { Vector3 } from 'three';
import { dispatchTelemetry } from '../telemetry/metricsBus';

export interface GravitationalState {
  phase: 'IDLE' | 'TYPING' | 'AI_THINKING' | 'MESSAGE_SUBMITTED';
  angularVelocity: number;
  accretionLuminosity: number;
  cursorAttractor: Vector3;
}

export class SingularityEngine {
  private state: GravitationalState;

  constructor() {
    this.state = {
      phase: 'IDLE',
      angularVelocity: 0.42,
      accretionLuminosity: 1.0,
      cursorAttractor: new Vector3(0, 0, 0),
    };
  }

  public stepSimulation(dt: number, targetSpeed: number): GravitationalState {
    const damping = 1.0 - Math.exp(-4.5 * dt);
    this.state.angularVelocity += (targetSpeed - this.state.angularVelocity) * damping;
    dispatchTelemetry('angular_velocity', this.state.angularVelocity);
    return this.state;
  }
}
""",
    },
    {
        "path": "src/telemetry/metricsBus.ts",
        "content": """export interface MetricSample {
  name: string;
  value: number;
  timestamp: number;
}

const ringBuffer: MetricSample[] = [];

export function dispatchTelemetry(name: string, value: number): void {
  if (ringBuffer.length > 256) {
    ringBuffer.shift();
  }
  ringBuffer.push({ name, value, timestamp: performance.now() });
}

export function getRecentMetrics(limit = 32): MetricSample[] {
  return ringBuffer.slice(-limit);
}
""",
    },
    {
        "path": "src/rag/vectorRetriever.py",
        "content": """from dataclasses import dataclass
import math
from typing import Sequence


@dataclass
class RetrievedChunk:
    file_path: str
    symbol: str
    score: float
    snippet: str


class HybridVectorRetriever:
    def __init__(self, dimension: int = 128) -> None:
        self.dimension = dimension

    def cosine_score(self, query: Sequence[float], candidate: Sequence[float]) -> float:
        dot = sum(a * b for a, b in zip(query, candidate))
        norm_q = math.sqrt(sum(a * a for a in query)) or 1.0
        norm_c = math.sqrt(sum(b * b for b in candidate)) or 1.0
        return dot / (norm_q * norm_c)

    def retrieve_top_k(self, query_vec: list[float], corpus: list[dict], top_k: int = 5) -> list[RetrievedChunk]:
        ranked = []
        for item in corpus:
            score = self.cosine_score(query_vec, item["embedding"])
            ranked.append(RetrievedChunk(item["path"], item["symbol"], score, item["content"]))
        return sorted(ranked, key=lambda r: r.score, reverse=True)[:top_k]
""",
    },
    {
        "path": "src/security/promptGateway.ts",
        "content": """import { dispatchTelemetry } from '../telemetry/metricsBus';

export interface ShieldVerdict {
  allowed: boolean;
  riskScore: number;
  sanitizedPrompt: string;
}

export function evaluatePromptSafety(rawPrompt: string): ShieldVerdict {
  const overrideRegex = /ignore\\s+all\\s+previous\\s+instructions/i;
  const matched = overrideRegex.test(rawPrompt);
  const riskScore = matched ? 78 : 4;
  dispatchTelemetry('shield_risk', riskScore);

  return {
    allowed: !matched,
    riskScore,
    sanitizedPrompt: rawPrompt.replace(overrideRegex, '[SHIELD_REDACTED]'),
  };
}
""",
    },
    {
        "path": "shaders/accretionPlasma.glsl",
        "content": """uniform float uTime;
uniform float uSpinIntensity;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 centered = vUv - 0.5;
  float radius = length(centered) * 2.0;
  float angle = atan(centered.y, centered.x) + uTime * uSpinIntensity / max(radius, 0.22);
  float spiral = sin(angle * 5.0 - radius * 14.0) * 0.5 + 0.5;
  vec3 gold = vec3(1.0, 0.702, 0.278);
  vec3 stellar = vec3(1.0, 0.941, 0.835);
  vec3 col = mix(gold, stellar, pow(spiral, 2.2));
  float alpha = smoothstep(0.28, 0.38, radius) * (1.0 - smoothstep(0.75, 1.0, radius));
  gl_FragColor = vec4(col, alpha);
}
""",
    },
]


async def seed_initial_workspace(db: AsyncSession) -> None:
    # Part J Section 14: Never seed test/demo accounts in staging or production
    if settings.is_production:
        return

    existing = await db.execute(select(User).limit(1))
    if existing.scalar_one_or_none() is not None:
        return

    commander = User(
        email="commander@devmind.ai",
        username="Singularity Architect",
        display_name="Singularity Architect",
        provider="local",
        role="user",
        account_status="active",
        password_hash=hash_password(secrets.token_urlsafe(24)),
    )
    db.add(commander)
    await db.flush()

    vis = UserVisualSettings(
        user_id=commander.id,
        mode="cinematic",
        background_animation=True,
        black_hole_rotation_intensity=1.0,
        background_pulse_intensity=1.0,
        gravitational_cursor_strength=1.0,
        particle_density=1.0,
        glass_transparency=0.08,
        dynamic_glass_reflections=True,
        text_deletion_animation=True,
        undo_reversal_animation=True,
        energy_pulses=True,
        graphics_quality="auto",
        reduced_motion=False,
    )
    db.add(vis)

    repo = Repository(
        user_id=commander.id,
        name="Singularity Core Engine",
        description="Reference gravitational intelligence runtime, GLSL accretion shaders, hybrid vector RAG, and PromptShield gateway.",
        status="indexed",
    )
    db.add(repo)
    await db.flush()

    lang_counts: dict[str, int] = {}
    total_symbols = 0
    total_chunks = 0

    for sf in STARTER_FILES:
        parsed = parse_repository_file(sf["path"], sf["content"])
        lang = parsed["language"]
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
        total_symbols += len(parsed["symbols"])

        rf = RepoFile(
            repo_id=repo.id,
            path=sf["path"],
            language=lang,
            content=sf["content"],
            loc=parsed["loc"],
            symbols_json=json.dumps(parsed["symbols"]),
            imports_json=json.dumps(parsed["imports"]),
            complexity_score=parsed["complexity"],
        )
        db.add(rf)

        for ch in parsed["chunks"]:
            vec = compute_local_embedding(f"{ch['file_path']} {ch['symbol_name']} {ch['content']}")
            chunk_kwargs = dict(
                repo_id=repo.id,
                file_path=ch["file_path"],
                start_line=ch["start_line"],
                end_line=ch["end_line"],
                symbol_name=ch["symbol_name"],
                content=ch["content"],
                embedding_json=json.dumps(vec),
            )
            if settings.is_postgres and hasattr(CodeChunk, "pg_embedding"):
                chunk_kwargs["pg_embedding"] = vec
            db.add(CodeChunk(**chunk_kwargs))
            total_chunks += 1

    repo.language_summary_json = json.dumps(lang_counts)
    repo.file_count = len(STARTER_FILES)
    repo.symbol_count = total_symbols
    repo.chunk_count = total_chunks

    memories = [
        (
            "Zero-Rerender 60 FPS Simulation Bus",
            "Continuous black-hole rotation, cosmic heartbeat waves, and cursor gravity run inside a mutable ref loop rather than React state to guarantee 60 FPS.",
            "architecture",
            ["threejs", "performance", "webgl"],
            0.95,
        ),
        (
            "Dual-Mode Vector Persistence Contract",
            "Embeddings persist as JSON vectors for zero-config SQLite and native pgvector Vector(128) columns when PostgreSQL is connected.",
            "database",
            ["pgvector", "postgresql", "sqlite"],
            0.9,
        ),
        (
            "PromptShield Pre-Flight Isolation",
            "Every chat query passes through PromptShield pattern & exfiltration verification prior to LLM invocation.",
            "security",
            ["promptshield", "gemini", "security"],
            0.92,
        ),
    ]

    for title, content, cat, tags, imp in memories:
        mvec = compute_local_embedding(f"{title} {content}")
        db.add(
            MemoryNode(
                user_id=commander.id,
                repo_id=repo.id,
                title=title,
                content=content,
                category=cat,
                tags_json=json.dumps(tags),
                importance=imp,
                embedding_json=json.dumps(mvec),
                links_json=json.dumps(["SingularityEngine", "HybridVectorRetriever"]),
            )
        )

    db.add(
        SecurityScanRecord(
            user_id=commander.id,
            repo_id=repo.id,
            scan_type="prompt_shield",
            input_excerpt="Baseline system integrity check across Singularity Core Engine",
            risk_score=0.0,
            verdict="SAFE",
            findings_json="[]",
        )
    )

    db.add(
        ModelTelemetry(
            user_id=commander.id,
            operation="system_boot_calibration",
            model_name=settings.GEMINI_MODEL,
            latency_ms=142.5,
            prompt_tokens=310,
            completion_tokens=195,
            status="healthy",
            health_score=99.2,
            notes="Singularity RAG & vector pipeline calibrated.",
        )
    )

    await db.commit()
