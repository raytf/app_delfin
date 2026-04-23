#!/usr/bin/env python3
"""Test script for WebSocket memory progress functionality."""

import asyncio
import json
import os
import tempfile
from pathlib import Path
import websockets

# Add the sidecar directory to Python path
import sys
sys.path.insert(0, str(Path(__file__).parent / "sidecar"))

from memory.ingest import IngestPipeline
from memory.xdg_utils import resolve_memory_dir


async def test_websocket_progress():
    """Test WebSocket progress updates during ingestion."""
    print("Testing WebSocket Memory Progress...")
    
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
        
        # Create a mock WebSocket connection
        class MockWebSocket:
            def __init__(self):
                self.messages = []
                
            async def send_json(self, data):
                """Mock send_json that stores messages for verification."""
                self.messages.append(data)
                print(f"WebSocket progress: {data['message']} ({data['pct']*100:.0f}%)")
        
        # Set the mock WebSocket connection
        mock_ws = MockWebSocket()
        pipeline.set_ws_connection(mock_ws)
        
        # Test session ingest
        print("Starting session ingest with WebSocket progress...")
        
        try:
            await pipeline.ingest_session("test-session-123")
            print("✓ Session ingest completed successfully!")
            
            # Verify WebSocket messages were sent
            if len(mock_ws.messages) > 0:
                print(f"\n✓ Received {len(mock_ws.messages)} WebSocket progress updates:")
                for i, msg in enumerate(mock_ws.messages, 1):
                    print(f"  {i}. {msg['phase']}: {msg['message']} ({msg['pct']*100:.0f}%)")
                
                # Verify we got the expected phases
                phases = [msg['phase'] for msg in mock_ws.messages]
                expected_phases = ['extract', 'summarize', 'propose_update', 'apply', 'done']
                
                if all(phase in phases for phase in expected_phases):
                    print("✓ All expected progress phases received")
                else:
                    print(f"❌ Missing expected phases. Got: {phases}, Expected: {expected_phases}")
                    return False
                    
                # Verify progress values are reasonable
                for msg in mock_ws.messages:
                    if 'pct' in msg and not (0 <= msg['pct'] <= 1):
                        print(f"❌ Invalid progress value: {msg['pct']}")
                        return False
                
                print("✓ All progress values are valid (0-1 range)")
                
            else:
                print("❌ No WebSocket messages received")
                return False
            
            print("\n✅ WebSocket progress test passed!")
            return True
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = asyncio.run(test_websocket_progress())
    sys.exit(0 if success else 1)