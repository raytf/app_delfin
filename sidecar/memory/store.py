"""Memory store — file I/O operations for the wiki system."""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .schemas import EntityExtraction, SourcePageDraft
from .xdg_utils import resolve_memory_dir


class MemoryStore:
    """File-based storage for the memory wiki system."""
    
    def __init__(self, memory_dir: Optional[str] = None):
        """Initialize the memory store."""
        self.memory_dir = resolve_memory_dir(memory_dir)
        self.wiki_dir = self.memory_dir / "wiki"
        self._ensure_structure()
    
    def _ensure_structure(self) -> None:
        """Ensure the wiki directory structure exists."""
        self.wiki_dir.mkdir(parents=True, exist_ok=True)
        (self.wiki_dir / "sources").mkdir(exist_ok=True)
        (self.wiki_dir / "entities").mkdir(exist_ok=True)
        (self.wiki_dir / "concepts").mkdir(exist_ok=True)
        (self.wiki_dir / "assets").mkdir(exist_ok=True)
        
        # Create index file if it doesn't exist
        index_file = self.wiki_dir / "index.md"
        if not index_file.exists():
            index_file.write_text("# Wiki Index\n\nThis file is automatically maintained by the system.\n\n## Pages\n\n| Path | Title | Summary | Tags | Sources | Updated |\n|------|-------|---------|------|---------|---------|\n")
        
        # Create log file if it doesn't exist
        log_file = self.wiki_dir / "log.md"
        if not log_file.exists():
            log_file.write_text("# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n")
    
    def get_page_path(self, page_id: str, kind: str) -> Path:
        """Get the path for a specific page."""
        if kind == "source":
            return self.wiki_dir / "sources" / f"{page_id}.md"
        elif kind == "entity":
            return self.wiki_dir / "entities" / f"{page_id}.md"
        elif kind == "concept":
            return self.wiki_dir / "concepts" / f"{page_id}.md"
        else:
            raise ValueError(f"Unknown page kind: {kind}")
    
    def read_page(self, page_id: str, kind: str) -> str:
        """Read a wiki page."""
        page_path = self.get_page_path(page_id, kind)
        if not page_path.exists():
            raise FileNotFoundError(f"Page {page_id} of kind {kind} not found")
        
        with open(page_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    def read_page_metadata(self, page_path: Path) -> tuple[dict, str]:
        """Read page metadata (frontmatter) and body from a page path."""
        if not page_path.exists():
            raise FileNotFoundError(f"Page {page_path} not found")
        
        with open(page_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse frontmatter
        if content.startswith('---'):
            lines = content.split('\n')
            frontmatter_lines = []
            in_frontmatter = False
            content_start = 0
            frontmatter_start = -1
            
            for i, line in enumerate(lines):
                if line.strip() == '---':
                    if not in_frontmatter:
                        in_frontmatter = True
                        frontmatter_start = i + 1
                    else:
                        in_frontmatter = False
                        content_start = i + 1
                        break
                elif in_frontmatter:
                    frontmatter_lines.append(line)
            
            # Parse frontmatter
            frontmatter = {}
            for line in frontmatter_lines:
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Handle list values
                    if value.startswith('[') and value.endswith(']'):
                        list_content = value[1:-1].strip()
                        items = [item.strip() for item in list_content.split(',') if item.strip()]
                        frontmatter[key] = items
                    else:
                        frontmatter[key] = value
            
            body = '\n'.join(lines[content_start:])
            return frontmatter, body
        
        # No frontmatter
        return {}, content
    
    def write_page(self, page_id: str, kind: str, content: str) -> None:
        """Write a wiki page."""
        page_path = self.get_page_path(page_id, kind)
        with open(page_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    def page_exists(self, page_id: str, kind: str) -> bool:
        """Check if a page exists."""
        page_path = self.get_page_path(page_id, kind)
        return page_path.exists()
    
    def list_pages(self, kind: str) -> List[str]:
        """List all pages of a specific kind."""
        if kind == "source":
            directory = self.wiki_dir / "sources"
        elif kind == "entity":
            directory = self.wiki_dir / "entities"
        elif kind == "concept":
            directory = self.wiki_dir / "concepts"
        else:
            raise ValueError(f"Unknown page kind: {kind}")
        
        return [f.stem for f in directory.glob("*.md")]
    
    def search_pages(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for pages containing the query."""
        results = []
        
        # Search in sources
        for source_file in (self.wiki_dir / "sources").glob("*.md"):
            with open(source_file, 'r', encoding='utf-8') as f:
                content = f.read()
            if query.lower() in content.lower():
                results.append({
                    "id": source_file.stem,
                    "kind": "source",
                    "title": source_file.stem,
                    "preview": content[:200] + "..."
                })
                if len(results) >= limit:
                    break
        
        # Search in entities
        if len(results) < limit:
            for entity_file in (self.wiki_dir / "entities").glob("*.md"):
                with open(entity_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                if query.lower() in content.lower():
                    results.append({
                        "id": entity_file.stem,
                        "kind": "entity",
                        "title": entity_file.stem,
                        "preview": content[:200] + "..."
                    })
                    if len(results) >= limit:
                        break
        
        # Search in concepts
        if len(results) < limit:
            for concept_file in (self.wiki_dir / "concepts").glob("*.md"):
                with open(concept_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                if query.lower() in content.lower():
                    results.append({
                        "id": concept_file.stem,
                        "kind": "concept",
                        "title": concept_file.stem,
                        "preview": content[:200] + "..."
                    })
                    if len(results) >= limit:
                        break
        
        return results
    
    def get_stats(self) -> Dict[str, int]:
        """Get statistics about the memory system."""
        return {
            "sources": len(list((self.wiki_dir / "sources").glob("*.md"))),
            "entities": len(list((self.wiki_dir / "entities").glob("*.md"))),
            "concepts": len(list((self.wiki_dir / "concepts").glob("*.md"))),
            "assets": len(list((self.wiki_dir / "assets").glob("*")))
        }
    
    def log_operation(self, operation: str, subject: str, details: str = "") -> None:
        """Log an operation to the wiki log."""
        log_file = self.wiki_dir / "log.md"
        
        # Read existing log
        if log_file.exists():
            with open(log_file, 'r', encoding='utf-8') as f:
                existing_content = f.read()
        else:
            existing_content = "# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n"
        
        # Add new entry
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n## [{timestamp}] {operation} | {subject}\n"
        if details:
            entry += f"{details}\n"
        
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write(existing_content + entry)
    
    def update_index(self, page_data: Dict[str, Any]) -> None:
        """Update the wiki index with page information."""
        index_file = self.wiki_dir / "index.md"
        
        # Read existing index
        if index_file.exists():
            with open(index_file, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            content = "# Wiki Index\n\nThis file is automatically maintained by the system.\n\n## Pages\n\n| Path | Title | Summary | Tags | Sources | Updated |\n|------|-------|---------|------|---------|---------|\n"
        
        # Check if page already exists in index
        lines = content.split('\n')
        page_id = page_data.get('id', '')
        page_exists = any(f"| {page_id} |" in line for line in lines)
        
        if not page_exists:
            # Add new page entry
            from datetime import datetime
            updated = datetime.now().strftime("%Y-%m-%d")
            
            new_entry = f"| {page_data.get('id', '')} | {page_data.get('title', '')} | {page_data.get('summary', '')[:50]} | {','.join(page_data.get('tags', []))} | {','.join(page_data.get('sources', []))} | {updated} |\n"
            
            # Find the table and add the entry before the last line
            table_start = None
            for i, line in enumerate(lines):
                if line.startswith('| Path | Title |'):
                    table_start = i
                    break
            
            if table_start is not None:
                # Insert after the header
                lines.insert(table_start + 1, new_entry)
                content = '\n'.join(lines)
            else:
                content += new_entry + "\n"
            
            with open(index_file, 'w', encoding='utf-8') as f:
                f.write(content)
    
    def create_source_page(self, source_id: str, draft: SourcePageDraft) -> None:
        """Create a source page from a draft."""
        # Create frontmatter
        frontmatter = f"""---
id: {source_id}
title: {draft.title}
kind: source
created: {self._get_current_date()}
updated: {self._get_current_date()}
tags: {', '.join(draft.tags)}
sources: []
---

"""
        
        content = frontmatter + draft.body
        self.write_page(source_id, "source", content)
        
        # Log the operation
        self.log_operation("create", f"source/{source_id}", f"Created source page from draft")
        
        # Update index
        self.update_index({
            "id": source_id,
            "title": draft.title,
            "summary": draft.body[:50],
            "tags": draft.tags,
            "sources": [],
            "kind": "source"
        })
    
    def create_entity_page(self, entity_id: str, extraction: EntityExtraction) -> None:
        """Create an entity page from extraction."""
        if not extraction.relevant:
            return
        
        # Create content from entities
        content_lines = [f"# {entity.name}", "", f"**Kind**: {entity.kind}", "", "## Evidence", ""]
        
        for entity in extraction.entities:
            content_lines.append(f"### {entity.name}")
            content_lines.append(f"""
**Kind**: {entity.kind}

**Evidence**: {entity.evidence}

---
""")
        
        # Create frontmatter
        frontmatter = f"""---
id: {entity_id}
title: {extraction.entities[0].name if extraction.entities else 'Untitled Entity'}
kind: entity
created: {self._get_current_date()}
updated: {self._get_current_date()}
tags: []
sources: []
---

"""
        
        content = frontmatter + '\n'.join(content_lines)
        self.write_page(entity_id, "entity", content)
        
        # Log the operation
        self.log_operation("create", f"entity/{entity_id}", f"Created entity page from extraction")
        
        # Update index
        self.update_index({
            "id": entity_id,
            "title": extraction.entities[0].name if extraction.entities else 'Untitled Entity',
            "summary": extraction.reason[:50],
            "tags": [],
            "sources": [],
            "kind": "entity"
        })
    
    def _get_current_date(self) -> str:
        """Get current date in YYYY-MM-DD format."""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d")
    
    def get_asset_path(self, asset_id: str) -> Path:
        """Get path for an asset."""
        return self.wiki_dir / "assets" / asset_id
    
    def store_asset(self, asset_id: str, data: bytes) -> None:
        """Store an asset."""
        asset_path = self.get_asset_path(asset_id)
        with open(asset_path, 'wb') as f:
            f.write(data)
    
    def read_asset(self, asset_id: str) -> bytes:
        """Read an asset."""
        asset_path = self.get_asset_path(asset_id)
        if not asset_path.exists():
            raise FileNotFoundError(f"Asset {asset_id} not found")
        
        with open(asset_path, 'rb') as f:
            return f.read()