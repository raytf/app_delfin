#!/usr/bin/env python3
"""Test script for memory endpoints."""

import sys
import os

# Add the sidecar directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'sidecar'))

from fastapi.testclient import TestClient
from server import app

def test_memory_endpoints():
    """Test the memory endpoints."""
    client = TestClient(app)
    
    print("Testing memory endpoints...")
    
    # Test health endpoint
    try:
        response = client.get('/memory/health')
        print(f'Health endpoint: {response.status_code} - {response.json()}')
    except Exception as e:
        print(f'Health endpoint error: {e}')
    
    # Test index endpoint
    try:
        response = client.get('/memory/index')
        print(f'Index endpoint: {response.status_code} - {response.json()}')
    except Exception as e:
        print(f'Index endpoint error: {e}')
    
    # Test stats endpoint
    try:
        response = client.get('/memory/stats')
        print(f'Stats endpoint: {response.status_code} - {response.json()}')
    except Exception as e:
        print(f'Stats endpoint error: {e}')
    
    # Test search endpoint
    try:
        response = client.get('/memory/search?query=test')
        print(f'Search endpoint: {response.status_code} - {response.json()}')
    except Exception as e:
        print(f'Search endpoint error: {e}')
    
    print("Memory endpoint testing complete!")

if __name__ == '__main__':
    test_memory_endpoints()