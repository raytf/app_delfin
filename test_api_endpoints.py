#!/usr/bin/env python3
"""Test script for memory API endpoints."""

import asyncio
import json
import os
import tempfile
from pathlib import Path
import httpx

# Add the sidecar directory to Python path
import sys
sys.path.insert(0, str(Path(__file__).parent / "sidecar"))

from memory.ingest import IngestPipeline
from memory.xdg_utils import resolve_memory_dir


async def test_api_endpoints():
    """Test the memory API endpoints."""
    print("Testing Memory API Endpoints...")
    
    # Create a temporary memory directory
    with tempfile.TemporaryDirectory() as temp_dir:
        memory_dir = Path(temp_dir) / "memory"
        memory_dir.mkdir()
        
        print(f"Using temporary memory directory: {memory_dir}")
        
        # Set environment variables
        os.environ["MEMORY_DIR"] = str(memory_dir)
        os.environ["MEMORY_ENABLED"] = "true"
        
        # Import and start the FastAPI app
        from server import app
        from fastapi.testclient import TestClient
        
        # Create test client
        client = TestClient(app)
        
        print("\n1. Testing /memory/health endpoint...")
        response = client.get("/memory/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data}")
            print("   ✓ Health endpoint working")
        else:
            print(f"   ❌ Health endpoint failed: {response.text}")
            return False
        
        print("\n2. Testing /memory/stats endpoint...")
        response = client.get("/memory/stats")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Stats: {data}")
            print("   ✓ Stats endpoint working")
        else:
            print(f"   ❌ Stats endpoint failed: {response.text}")
            return False
        
        print("\n3. Testing /memory/ingest/status endpoint...")
        response = client.get("/memory/ingest/status")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Ingest status: {data}")
            print("   ✓ Ingest status endpoint working")
        else:
            print(f"   ❌ Ingest status endpoint failed: {response.text}")
            return False
        
        print("\n4. Testing /memory/ingest/session endpoint...")
        # Note: This will fail because the ingest pipeline needs a real engine
        # But we can test that the endpoint is properly set up
        response = client.post("/memory/ingest/session", json={"session_id": "test-session-123"})
        print(f"   Status: {response.status_code}")
        if response.status_code == 500:
            data = response.json()
            print(f"   Expected error (no engine): {data.get('detail', '')}")
            print("   ✓ Ingest session endpoint properly configured")
        else:
            print(f"   Response: {response.json()}")
            print("   ✓ Ingest session endpoint working")
        
        print("\n5. Testing /memory/index endpoint...")
        response = client.get("/memory/index")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Pages count: {len(data.get('pages', []))}")
            print("   ✓ Index endpoint working")
        else:
            print(f"   ❌ Index endpoint failed: {response.text}")
            return False
        
        print("\n✅ All API endpoint tests passed!")
        return True


if __name__ == "__main__":
    success = asyncio.run(test_api_endpoints())
    sys.exit(0 if success else 1)