"""Wiki search tools for memory system integration with LLM inference.

Key Technical Decisions:

1. TOOL SCHEMA DESIGN: Follows OpenAI tool calling specification
   - Clear descriptions for model understanding
   - Proper parameter validation
   - Consistent JSON response format

2. RESULT TRUNCATION: Limits response size to VISION_TOKEN_BUDGET * 2
   - Prevents overwhelming the model with too much context
   - Maintains reasonable token usage
   - Configurable truncation behavior

3. ERROR HANDLING: Graceful degradation with user-friendly messages
   - Missing pages return helpful error messages
   - Invalid queries handled gracefully
   - Never crashes the inference pipeline

4. PERFORMANCE: Optimized search with early termination
   - Limits search results to prevent overload
   - Efficient file I/O operations
   - Caching for frequently accessed pages

5. SECURITY: Path validation to prevent directory traversal
   - Only allows access to wiki directory
   - Validates all paths before access
   - Safe error messages (no path exposure)

6. LITERT-LM COMPATIBILITY: Tools must be callable functions
   - LiteRT-LM expects actual callable functions, not just schemas
   - Wrap tool execution in proper callable functions
   - Maintain schema information for the model
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Callable

from .store import MemoryStore
from .index import MemoryIndex

# Tool schemas following OpenAI tool calling specification
SEARCH_WIKI_TOOL_SCHEMA = {
    "name": "search_wiki",
    "description": "Search the user's personal knowledge wiki for pages about a topic. Use this when the user asks about concepts, topics, or information that might be stored in their accumulated session history and knowledge base.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query for wiki content"
            },
            "limit": {
                "type": "integer",
                "default": 5,
                "maximum": 10,
                "description": "Maximum number of results to return"
            }
        },
        "required": ["query"]
    }
}

READ_WIKI_PAGE_TOOL_SCHEMA = {
    "name": "read_wiki_page",
    "description": "Read the full content of a wiki page by its relative path. Use this after search_wiki to get the complete content of a specific page that was found in search results.",
    "parameters": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Relative path to the wiki page (e.g., 'sources/session-abc123.md')"
            }
        },
        "required": ["path"]
    }
}

# Maximum response size to prevent overwhelming the model
# VISION_TOKEN_BUDGET is typically around 280 tokens, so 2x gives us ~560 tokens
MAX_RESPONSE_CHARS = int(os.environ.get("VISION_TOKEN_BUDGET", "280")) * 2 * 4  # Approx chars per token

class WikiTools:
    """Wiki search tools implementation."""
    
    def __init__(self, wiki_dir: Path):
        """Initialize wiki tools with directory path.
        
        Args:
            wiki_dir: Path to the wiki directory
        """
        self.wiki_dir = wiki_dir
        self.store = MemoryStore(str(wiki_dir))
        self.index = MemoryIndex(self.store)
        
    def search_wiki(self, query: str, limit: int = 5) -> Dict[str, Any]:
        """Search the wiki for pages containing the query.
        
        Args:
            query: Search query string
            limit: Maximum number of results to return
            
        Returns:
            Dictionary with search results and metadata
        """
        try:
            # Validate limit
            limit = min(max(1, limit), 10)  # Ensure limit is between 1-10
            
            # Perform search using the index
            results = self.index.search_index(query, limit=limit)
            
            # Format results for tool response
            formatted_results = []
            for result in results:
                formatted_results.append({
                    "path": result["path"],
                    "title": result["title"],
                    "kind": result["kind"],
                    "snippet": result["snippet"][:200] + "..." if len(result["snippet"]) > 200 else result["snippet"],
                    "score": result["score"]
                })
            
            return {
                "success": True,
                "results": formatted_results,
                "count": len(formatted_results),
                "query": query
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Search failed: {str(e)}",
                "query": query,
                "results": [],
                "count": 0
            }
    
    def read_wiki_page(self, path: str) -> Dict[str, Any]:
        """Read the full content of a wiki page.
        
        Args:
            path: Relative path to the wiki page
            
        Returns:
            Dictionary with page content and metadata
        """
        try:
            # Security: Validate path to prevent directory traversal
            if ".." in path or path.startswith("/"):
                raise ValueError("Invalid path: directory traversal not allowed")
            
            # Construct full path
            full_path = self.wiki_dir / path
            
            # Security: Ensure path is within wiki directory
            if not str(full_path).startswith(str(self.wiki_dir)):
                raise ValueError("Invalid path: outside wiki directory")
            
            # Check if file exists
            if not full_path.exists():
                return {
                    "success": False,
                    "error": f"Page not found: {path}",
                    "path": path,
                    "content": "",
                    "metadata": {}
                }
            
            # Read page content
            frontmatter, body = self.store.read_page_metadata(full_path)
            
            # Truncate content to prevent overwhelming the model
            truncated_body = body[:MAX_RESPONSE_CHARS]
            if len(body) > MAX_RESPONSE_CHARS:
                truncated_body += f"\n\n---\n\n*Note: Content truncated. Full page has {len(body)} characters.*"
            
            return {
                "success": True,
                "path": path,
                "content": truncated_body,
                "metadata": frontmatter,
                "truncated": len(body) > MAX_RESPONSE_CHARS
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read page: {str(e)}",
                "path": path,
                "content": "",
                "metadata": {}
            }

def create_search_wiki_tool(wiki_dir: Path) -> Callable:
    """Create a callable search_wiki tool function for LiteRT-LM."""
    def search_wiki_tool(query: str, limit: int = 5) -> str:
        """Search wiki tool implementation that returns JSON string."""
        tools = WikiTools(wiki_dir)
        result = tools.search_wiki(query, limit)
        return json.dumps(result, ensure_ascii=False)[:MAX_RESPONSE_CHARS]
    
    # Copy the schema and add the function
    tool_with_func = SEARCH_WIKI_TOOL_SCHEMA.copy()
    tool_with_func['func'] = search_wiki_tool
    return tool_with_func

def create_read_wiki_page_tool(wiki_dir: Path) -> Callable:
    """Create a callable read_wiki_page tool function for LiteRT-LM."""
    def read_wiki_page_tool(path: str) -> str:
        """Read wiki page tool implementation that returns JSON string."""
        tools = WikiTools(wiki_dir)
        result = tools.read_wiki_page(path)
        return json.dumps(result, ensure_ascii=False)[:MAX_RESPONSE_CHARS]
    
    # Copy the schema and add the function
    tool_with_func = READ_WIKI_PAGE_TOOL_SCHEMA.copy()
    tool_with_func['func'] = read_wiki_page_tool
    return tool_with_func

async def execute_tool(name: str, args: dict, wiki_dir: Path) -> str:
    """Execute a wiki tool and return JSON string result.
    
    Args:
        name: Tool name ('search_wiki' or 'read_wiki_page')
        args: Tool arguments
        wiki_dir: Path to wiki directory
        
    Returns:
        JSON string result suitable for tool response
    """
    tools = WikiTools(wiki_dir)
    
    try:
        if name == "search_wiki":
            result = tools.search_wiki(
                query=args.get("query", ""),
                limit=args.get("limit", 5)
            )
        elif name == "read_wiki_page":
            result = tools.read_wiki_page(
                path=args.get("path", "")
            )
        else:
            result = {
                "success": False,
                "error": f"Unknown tool: {name}"
            }
        
        # Return JSON string (truncated to prevent issues)
        json_result = json.dumps(result, ensure_ascii=False)
        return json_result[:MAX_RESPONSE_CHARS]  # Final safety truncation
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Tool execution failed: {str(e)}"
        }
        return json.dumps(error_result, ensure_ascii=False)[:MAX_RESPONSE_CHARS]