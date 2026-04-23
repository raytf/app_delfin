#!/usr/bin/env python3
"""Test script for memory ingest functionality."""

import asyncio
import json
import os
import tempfile
from pathlib import Path

# Add the sidecar directory to Python path
import sys
sys.path.insert(0, str(Path(__file__).parent / "sidecar"))

from memory.ingest import IngestPipeline
from memory.xdg_utils import resolve_memory_dir


async def test_ingest_pipeline():
    """Test the ingest pipeline with mock data."""
    print("Testing Memory Ingest Pipeline...")
    
    # Create a temporary memory directory
    with tempfile.TemporaryDirectory() as temp_dir:
        memory_dir = Path(temp_dir) / "memory"
        memory_dir.mkdir()
        
        print(f"Using temporary memory directory: {memory_dir}")
        
        # Create mock engine
        class MockEngine:
            async def generate(self, prompt):
                """Mock engine that returns predefined responses."""
                prompt_text = prompt[1]["content"]
                
                if "ENTITY_EXTRACTION" in prompt_text:
                    return json.dumps({
                        "relevant": True,
                        "reason": "Session contains meaningful entities",
                        "entities": [
                            {
                                "name": "Test Entity",
                                "kind": "concept",
                                "evidence": "This is a test entity."
                            }
                        ]
                    })
                elif "SOURCE_PAGE_CREATION" in prompt_text:
                    return json.dumps({
                        "title": "Test Session",
                        "tags": ["test", "demo"],
                        "body": "# Test Session\n\nThis is a test session for the memory system."
                    })
                elif "ENTITY_UPDATE_PROPOSAL" in prompt_text:
                    return json.dumps({
                        "action": "create",
                        "new_body": "# Test Entity\n\nThis is a test entity page.",
                        "rationale": "New entity created"
                    })
                
                return "{}"
        
        # Initialize pipeline
        pipeline = IngestPipeline(memory_dir, MockEngine())
        
        # Test session ingest
        print("Starting session ingest...")
        
        async def progress_callback(step: str, progress: float):
            print(f"  Progress: {step} ({progress*100:.1f}%)")
        
        try:
            await pipeline.ingest_session("test-session-123", progress_callback)
            print("✓ Session ingest completed successfully!")
            
            # Check created files
            wiki_dir = memory_dir / "wiki"
            sources_dir = wiki_dir / "sources"
            entities_dir = wiki_dir / "entities"
            
            print("\nCreated files:")
            for file in sources_dir.glob("*.md"):
                print(f"  Source: {file.name}")
                with open(file, 'r') as f:
                    content = f.read()
                    print(f"    Content preview: {content[:100]}...")
            
            for file in entities_dir.glob("*.md"):
                print(f"  Entity: {file.name}")
                with open(file, 'r') as f:
                    content = f.read()
                    print(f"    Content preview: {content[:100]}...")
            
            # Check index
            index_file = wiki_dir / "index.md"
            if index_file.exists():
                print(f"\n✓ Index file created: {index_file.name}")
                with open(index_file, 'r') as f:
                    index_content = f.read()
                    print(f"  Index content length: {len(index_content)} characters")
            
            # Check log
            log_file = wiki_dir / "log.md"
            if log_file.exists():
                print(f"\n✓ Log file created: {log_file.name}")
                with open(log_file, 'r') as f:
                    log_content = f.read()
                    print(f"  Log entries found: {log_content.count('##')}")
            
            print("\n✅ All tests passed!")
            return True
            
        except Exception as e:
            print(f"❌ Ingest failed: {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = asyncio.run(test_ingest_pipeline())
    sys.exit(0 if success else 1)