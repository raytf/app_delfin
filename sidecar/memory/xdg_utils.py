import os
from pathlib import Path
from typing import Optional


def get_xdg_data_home() -> Path:
    """
    Get the XDG data home directory according to the XDG base directory specification.
    
    Returns:
        Path to XDG_DATA_HOME directory, or default if not set
    """
    # Check if XDG_DATA_HOME is set
    xdg_data_home = os.environ.get("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home)
    
    # Default to ~/.local/share
    home = Path.home()
    return home / ".local" / "share"


def get_default_memory_dir() -> Path:
    """
    Get the default memory directory path.
    
    Returns:
        Path to the default memory directory
    """
    xdg_data_home = get_xdg_data_home()
    return xdg_data_home / "delfin" / "memory"


def resolve_memory_dir(env_memory_dir: Optional[str] = None) -> Path:
    """
    Resolve the memory directory path from environment variable or default.
    
    Args:
        env_memory_dir: Optional override from MEMORY_DIR environment variable
        
    Returns:
        Resolved Path to the memory directory
    """
    if env_memory_dir:
        return Path(env_memory_dir).expanduser().absolute()
    
    return get_default_memory_dir()


def ensure_memory_dir_exists(memory_dir: Path) -> None:
    """
    Ensure the memory directory and its subdirectories exist.
    
    Args:
        memory_dir: Path to the memory directory
        
    Creates:
        - memory_dir/wiki/{sources,entities,concepts,assets}
        - memory_dir/state
    """
    # Create main directory
    memory_dir.mkdir(parents=True, exist_ok=True)
    
    # Create wiki subdirectories
    wiki_dir = memory_dir / "wiki"
    wiki_dir.mkdir(exist_ok=True)
    
    (wiki_dir / "sources").mkdir(exist_ok=True)
    (wiki_dir / "entities").mkdir(exist_ok=True)
    (wiki_dir / "concepts").mkdir(exist_ok=True)
    (wiki_dir / "assets").mkdir(exist_ok=True)
    
    # Create state directory
    (memory_dir / "state").mkdir(exist_ok=True)
    
    # Create initial files if they don't exist
    agents_file = memory_dir / "AGENTS.md"
    if not agents_file.exists():
        # Create default AGENTS.md template
        default_agents_content = """# Delfin Memory Wiki - Agent Conventions

This file describes the conventions that the LLM agents follow when maintaining your personal knowledge wiki.

## Structure

The wiki is organized into three main layers:

1. **Sources** (`wiki/sources/`): Raw session transcripts, file imports, and other primary materials
2. **Entities** (`wiki/entities/`): People, places, products, events mentioned in sources
3. **Concepts** (`wiki/concepts/`): Ideas, topics, definitions extracted from sources

## Page Format

Each page should have YAML frontmatter:

```yaml
---
id: unique-page-identifier
title: Page Title
kind: source|entity|concept
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_ids: [list, of, source, ids]
tags: [list, of, tags]
---

Page content in Markdown format.
```

## Wikilinks

Use double-bracket format for internal links: `[[Page Name]]`

## Log Format

Log entries in `wiki/log.md` follow this format:

```markdown
## [YYYY-MM-DD HH:MM] operation | subject
Optional detailed description
```

## User Editable

You may edit this file to change conventions. The system will re-read it at the start of each ingest operation.
"""
        agents_file.write_text(default_agents_content)
    
    index_file = memory_dir / "wiki" / "index.md"
    if not index_file.exists():
        index_file.write_text("# Wiki Index\n\nThis file is automatically maintained by the system.\n\n## Pages\n\n| Path | Title | Summary | Tags | Sources | Updated |\n|------|-------|---------|------|---------|---------|\n")
    
    log_file = memory_dir / "wiki" / "log.md"
    if not log_file.exists():
        log_file.write_text("# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n")
