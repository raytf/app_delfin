"""FastAPI router for memory system — read-only wiki infrastructure."""

import json
import os
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from .schemas import EntityExtraction, SourcePageDraft
from .xdg_utils import resolve_memory_dir

router = APIRouter(prefix="/memory", tags=["memory"])


def get_memory_dir() -> Path:
    """Get the memory directory path."""
    memory_dir = resolve_memory_dir(os.environ.get("MEMORY_DIR"))
    return memory_dir


def ensure_wiki_structure(memory_dir: Path) -> None:
    """Ensure the wiki directory structure exists."""
    # Create main wiki directory
    wiki_dir = memory_dir / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    
    # Create subdirectories
    (wiki_dir / "sources").mkdir(exist_ok=True)
    (wiki_dir / "entities").mkdir(exist_ok=True)
    (wiki_dir / "concepts").mkdir(exist_ok=True)
    (wiki_dir / "assets").mkdir(exist_ok=True)
    
    # Create index file if it doesn't exist
    index_file = wiki_dir / "index.md"
    if not index_file.exists():
        index_file.write_text("# Wiki Index\n\nThis file is automatically maintained by the system.\n\n## Pages\n\n| Path | Title | Summary | Tags | Sources | Updated |\n|------|-------|---------|------|---------|---------|\n")
    
    # Create log file if it doesn't exist
    log_file = wiki_dir / "log.md"
    if not log_file.exists():
        log_file.write_text("# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n")


@router.get("/health")
async def memory_health() -> dict:
    """Check memory system health and directory structure."""
    try:
        memory_dir = get_memory_dir()
        ensure_wiki_structure(memory_dir)
        
        # Check if we can write to the directory
        test_file = memory_dir / "wiki" / ".healthcheck"
        try:
            test_file.write_text("ok")
            test_file.unlink()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Memory directory not writable: {e}")
        
        return {
            "status": "ok",
            "memory_dir": str(memory_dir),
            "wiki_dir": str(memory_dir / "wiki"),
            "writable": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Memory health check failed: {e}")


@router.get("/index")
async def get_wiki_index() -> dict:
    """Get the wiki index with all pages and metadata."""
    try:
        memory_dir = get_memory_dir()
        wiki_dir = memory_dir / "wiki"
        
        # Read the index file
        index_file = wiki_dir / "index.md"
        if not index_file.exists():
            ensure_wiki_structure(memory_dir)
            return {"pages": [], "stats": {"total_pages": 0, "total_sources": 0, "total_entities": 0, "total_concepts": 0}}
        
        # Parse the index file to extract page information
        with open(index_file, 'r') as f:
            content = f.read()
        
        # Simple parsing - look for table rows after the header
        lines = content.split('\n')
        pages = []
        
        in_table = False
        for line in lines:
            if line.startswith('| Path | Title |'):
                in_table = True
                continue
            if in_table and line.startswith('|') and '|' in line:
                parts = [p.strip() for p in line.split('|') if p.strip()]
                if len(parts) >= 6:
                    pages.append({
                        "path": parts[0],
                        "title": parts[1],
                        "summary": parts[2] if len(parts) > 2 else "",
                        "tags": parts[3].split(',') if len(parts) > 3 else [],
                        "sources": parts[4].split(',') if len(parts) > 4 else [],
                        "updated": parts[5] if len(parts) > 5 else ""
                    })
        
        # Count files in subdirectories
        sources_count = len(list((wiki_dir / "sources").glob("*.md")))
        entities_count = len(list((wiki_dir / "entities").glob("*.md")))
        concepts_count = len(list((wiki_dir / "concepts").glob("*.md")))
        
        return {
            "pages": pages,
            "stats": {
                "total_pages": len(pages),
                "total_sources": sources_count,
                "total_entities": entities_count,
                "total_concepts": concepts_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get wiki index: {e}")


@router.get("/page")
async def get_wiki_page(
    path: str = Query(..., description="Path to the wiki page"),
    kind: Optional[str] = Query(None, description="Kind of page (source, entity, concept)")
) -> dict:
    """Get a specific wiki page content."""
    try:
        memory_dir = get_memory_dir()
        wiki_dir = memory_dir / "wiki"
        
        # Determine the full path based on kind
        if kind == "source":
            page_path = wiki_dir / "sources" / f"{path}.md"
        elif kind == "entity":
            page_path = wiki_dir / "entities" / f"{path}.md"
        elif kind == "concept":
            page_path = wiki_dir / "concepts" / f"{path}.md"
        else:
            # Try to find the page in any directory
            possible_paths = [
                wiki_dir / "sources" / f"{path}.md",
                wiki_dir / "entities" / f"{path}.md", 
                wiki_dir / "concepts" / f"{path}.md",
                wiki_dir / f"{path}.md"
            ]
            
            page_path = None
            for p in possible_paths:
                if p.exists():
                    page_path = p
                    break
            
            if page_path is None:
                raise HTTPException(status_code=404, detail="Page not found")
        
        if not page_path.exists():
            raise HTTPException(status_code=404, detail="Page not found")
        
        # Read the page content
        with open(page_path, 'r') as f:
            content = f.read()
        
        # Parse frontmatter if present
        page_data = {
            "path": str(page_path.relative_to(wiki_dir)),
            "content": content,
            "metadata": {}
        }
        
        # Simple frontmatter parsing
        if content.startswith('---'):
            lines = content.split('\n')
            frontmatter_lines = []
            in_frontmatter = True
            content_start = 0
            
            for i, line in enumerate(lines):
                if line.strip() == '---':
                    if in_frontmatter:
                        in_frontmatter = False
                        content_start = i + 1
                        break
                    else:
                        break
                elif in_frontmatter:
                    frontmatter_lines.append(line)
            
            # Parse frontmatter
            frontmatter = {}
            for line in frontmatter_lines:
                if ':' in line:
                    key, value = line.split(':', 1)
                    frontmatter[key.strip()] = value.strip()
            
            page_data["metadata"] = frontmatter
            page_data["content"] = '\n'.join(lines[content_start:])
        
        return page_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get wiki page: {e}")


@router.get("/search")
async def search_wiki(
    query: str = Query(..., description="Search query"),
    limit: int = Query(10, description="Maximum number of results")
) -> dict:
    """Search the wiki for pages containing the query."""
    try:
        memory_dir = get_memory_dir()
        wiki_dir = memory_dir / "wiki"
        
        results = []
        
        # Search in sources
        for source_file in (wiki_dir / "sources").glob("*.md"):
            with open(source_file, 'r') as f:
                content = f.read()
            if query.lower() in content.lower():
                results.append({
                    "path": str(source_file.relative_to(wiki_dir)),
                    "kind": "source",
                    "title": source_file.stem,
                    "preview": content[:200] + "..."
                })
                if len(results) >= limit:
                    break
        
        # Search in entities
        if len(results) < limit:
            for entity_file in (wiki_dir / "entities").glob("*.md"):
                with open(entity_file, 'r') as f:
                    content = f.read()
                if query.lower() in content.lower():
                    results.append({
                        "path": str(entity_file.relative_to(wiki_dir)),
                        "kind": "entity",
                        "title": entity_file.stem,
                        "preview": content[:200] + "..."
                    })
                    if len(results) >= limit:
                        break
        
        # Search in concepts
        if len(results) < limit:
            for concept_file in (wiki_dir / "concepts").glob("*.md"):
                with open(concept_file, 'r') as f:
                    content = f.read()
                if query.lower() in content.lower():
                    results.append({
                        "path": str(concept_file.relative_to(wiki_dir)),
                        "kind": "concept",
                        "title": concept_file.stem,
                        "preview": content[:200] + "..."
                    })
                    if len(results) >= limit:
                        break
        
        return {"results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search wiki: {e}")


@router.get("/stats")
async def get_memory_stats() -> dict:
    """Get statistics about the memory system."""
    try:
        memory_dir = get_memory_dir()
        wiki_dir = memory_dir / "wiki"
        
        # Count files
        sources_count = len(list((wiki_dir / "sources").glob("*.md")))
        entities_count = len(list((wiki_dir / "entities").glob("*.md")))
        concepts_count = len(list((wiki_dir / "concepts").glob("*.md")))
        assets_count = len(list((wiki_dir / "assets").glob("*")))
        
        # Get directory sizes
        def get_dir_size(directory: Path) -> int:
            total_size = 0
            for file in directory.glob("**/*"):
                if file.is_file():
                    total_size += file.stat().st_size
            return total_size
        
        return {
            "sources": sources_count,
            "entities": entities_count,
            "concepts": concepts_count,
            "assets": assets_count,
            "total_size_bytes": get_dir_size(wiki_dir),
            "memory_dir": str(memory_dir)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get memory stats: {e}")