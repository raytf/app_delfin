from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional

class EntityExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    relevant: bool
    reason: str
    entities: list['ExtractedEntity']

class ExtractedEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    kind: Literal["person", "place", "concept", "product", "event", "other"]
    evidence: str

class SourcePageDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    tags: list[str]
    body: str

class EntityUpdateProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["create", "update", "skip"]
    new_body: Optional[str]
    rationale: str

class ConceptUpdateProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["create", "update", "skip"]
    new_body: Optional[str]
    rationale: str

class ContradictionFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim_a: str
    claim_b: str
    source_a: str
    source_b: str
    severity: Literal["minor", "major"]

class LintReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    orphans: list[str]
    broken_links: list[tuple[str, str]]
    missing_index: list[str]
    stale_pages: list[str]
    contradictions: list[ContradictionFinding]
    generated_at: str