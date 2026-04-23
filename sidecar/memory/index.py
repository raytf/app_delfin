"""Memory index — wiki indexing and search functionality."""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .store import MemoryStore


class MemoryIndex:
    """Index and search functionality for the memory wiki."""
    
    def __init__(self, memory_store: MemoryStore):
        """Initialize the memory index."""
        self.store = memory_store
    
    def build_index(self) -> Dict[str, Dict[str, Any]]:
        """Build a complete index of all wiki pages."""
        index = {
            "sources": {},
            "entities": {},
            "concepts": {}
        }
        
        # Index sources
        for source_id in self.store.list_pages("source"):
            try:
                content = self.store.read_page(source_id, "source")
                metadata = self._extract_metadata(content)
                index["sources"][source_id] = {
                    "id": source_id,
                    "title": metadata.get("title", source_id),
                    "tags": metadata.get("tags", []),
                    "content": content
                }
            except Exception as e:
                print(f"Error indexing source {source_id}: {e}")
        
        # Index entities
        for entity_id in self.store.list_pages("entity"):
            try:
                content = self.store.read_page(entity_id, "entity")
                metadata = self._extract_metadata(content)
                index["entities"][entity_id] = {
                    "id": entity_id,
                    "title": metadata.get("title", entity_id),
                    "kind": metadata.get("kind", "entity"),
                    "content": content
                }
            except Exception as e:
                print(f"Error indexing entity {entity_id}: {e}")
        
        # Index concepts
        for concept_id in self.store.list_pages("concept"):
            try:
                content = self.store.read_page(concept_id, "concept")
                metadata = self._extract_metadata(content)
                index["concepts"][concept_id] = {
                    "id": concept_id,
                    "title": metadata.get("title", concept_id),
                    "content": content
                }
            except Exception as e:
                print(f"Error indexing concept {concept_id}: {e}")
        
        return index
    
    def _extract_metadata(self, content: str) -> Dict[str, str]:
        """Extract metadata from page content."""
        metadata = {}
        
        if content.startswith('---'):
            lines = content.split('\n')
            in_frontmatter = True
            
            for line in lines:
                if line.strip() == '---':
                    if in_frontmatter:
                        in_frontmatter = False
                    else:
                        break
                elif in_frontmatter and ':' in line:
                    key, value = line.split(':', 1)
                    metadata[key.strip()] = value.strip()
        
        return metadata
    
    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search the wiki using advanced search with relevance scoring."""
        return self.advanced_search(query, limit)
    
    def advanced_search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Advanced search with better ranking and metadata extraction."""
        results = []
        
        # Search in sources
        for source_id in self.store.list_pages("source"):
            try:
                content = self.store.read_page(source_id, "source")
                score = self._calculate_score(content, query)
                if score > 0:
                    metadata = self._extract_metadata(content)
                    results.append({
                        "id": source_id,
                        "kind": "source",
                        "title": metadata.get("title", source_id),
                        "score": score,
                        "preview": self._get_preview(content, query),
                        "tags": metadata.get("tags", [])
                    })
            except Exception as e:
                print(f"Error searching source {source_id}: {e}")
        
        # Search in entities
        for entity_id in self.store.list_pages("entity"):
            try:
                content = self.store.read_page(entity_id, "entity")
                score = self._calculate_score(content, query)
                if score > 0:
                    metadata = self._extract_metadata(content)
                    results.append({
                        "id": entity_id,
                        "kind": "entity",
                        "title": metadata.get("title", entity_id),
                        "score": score,
                        "preview": self._get_preview(content, query),
                        "kind": metadata.get("kind", "entity")
                    })
            except Exception as e:
                print(f"Error searching entity {entity_id}: {e}")
        
        # Search in concepts
        for concept_id in self.store.list_pages("concept"):
            try:
                content = self.store.read_page(concept_id, "concept")
                score = self._calculate_score(content, query)
                if score > 0:
                    metadata = self._extract_metadata(content)
                    results.append({
                        "id": concept_id,
                        "kind": "concept",
                        "title": metadata.get("title", concept_id),
                        "score": score,
                        "preview": self._get_preview(content, query)
                    })
            except Exception as e:
                print(f"Error searching concept {concept_id}: {e}")
        
        # Sort by score (descending)
        results.sort(key=lambda x: x["score"], reverse=True)
        
        return results[:limit]
    
    def _calculate_score(self, content: str, query: str) -> float:
        """Calculate relevance score for search results."""
        score = 0.0
        
        # Exact match in title (high weight)
        if content.startswith('---'):
            lines = content.split('\n')
            in_frontmatter = True
            title = ""
            
            for line in lines:
                if line.strip() == '---':
                    if in_frontmatter:
                        in_frontmatter = False
                    else:
                        break
                elif in_frontmatter and line.startswith('title:'):
                    title = line.split(':', 1)[1].strip()
                    break
            
            if query.lower() in title.lower():
                score += 10.0
        
        # Exact phrase match (medium weight)
        if query.lower() in content.lower():
            score += 5.0
        
        # Word matches (low weight)
        query_words = query.lower().split()
        content_lower = content.lower()
        for word in query_words:
            if word in content_lower:
                score += 1.0
        
        return score
    
    def _get_preview(self, content: str, query: str) -> str:
        """Get a preview of content around the query."""
        # Find the query in content
        content_lower = content.lower()
        query_lower = query.lower()
        query_pos = content_lower.find(query_lower)
        
        if query_pos == -1:
            return content[:200] + "..."
        
        # Get context around the query
        start = max(0, query_pos - 50)
        end = min(len(content), query_pos + len(query) + 100)
        preview = content[start:end]
        
        # Highlight the query
        preview = preview.replace(query, f"**{query}**")
        
        if start > 0:
            preview = "..." + preview
        if end < len(content):
            preview = preview + "..."
        
        return preview
    
    def get_related_pages(self, page_id: str, kind: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Get pages related to a specific page."""
        try:
            content = self.store.read_page(page_id, kind)
            metadata = self._extract_metadata(content)
            
            # Extract keywords from content
            keywords = self._extract_keywords(content)
            
            # Find pages that mention these keywords
            related = []
            
            for source_id in self.store.list_pages("source"):
                if source_id == page_id and kind == "source":
                    continue
                try:
                    source_content = self.store.read_page(source_id, "source")
                    score = sum(1 for kw in keywords if kw.lower() in source_content.lower())
                    if score > 0:
                        related.append({
                            "id": source_id,
                            "kind": "source",
                            "title": self._extract_metadata(source_content).get("title", source_id),
                            "score": score
                        })
                except Exception:
                    pass
            
            for entity_id in self.store.list_pages("entity"):
                if entity_id == page_id and kind == "entity":
                    continue
                try:
                    entity_content = self.store.read_page(entity_id, "entity")
                    score = sum(1 for kw in keywords if kw.lower() in entity_content.lower())
                    if score > 0:
                        related.append({
                            "id": entity_id,
                            "kind": "entity",
                            "title": self._extract_metadata(entity_content).get("title", entity_id),
                            "score": score
                        })
                except Exception:
                    pass
            
            for concept_id in self.store.list_pages("concept"):
                if concept_id == page_id and kind == "concept":
                    continue
                try:
                    concept_content = self.store.read_page(concept_id, "concept")
                    score = sum(1 for kw in keywords if kw.lower() in concept_content.lower())
                    if score > 0:
                        related.append({
                            "id": concept_id,
                            "kind": "concept",
                            "title": self._extract_metadata(concept_content).get("title", concept_id),
                            "score": score
                        })
                except Exception:
                    pass
            
            # Sort by score and limit
            related.sort(key=lambda x: x["score"], reverse=True)
            return related[:limit]
            
        except Exception as e:
            print(f"Error getting related pages: {e}")
            return []
    
    def _extract_keywords(self, content: str) -> List[str]:
        """Extract keywords from content."""
        # Simple keyword extraction - look for words that appear frequently
        words = re.findall(r'\b\w+\b', content.lower())
        
        # Filter out common words
        stop_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of', 'for', 'a', 'an'}
        keywords = [word for word in words if word not in stop_words and len(word) > 3]
        
        # Get top 10 most frequent keywords
        from collections import Counter
        counter = Counter(keywords)
        
        return [word for word, count in counter.most_common(10)]
    
    def get_backlinks(self, page_id: str, kind: str) -> List[Dict[str, Any]]:
        """Get pages that link to this page."""
        backlinks = []
        
        # Look for wikilinks [[page_id]] in all pages
        for source_id in self.store.list_pages("source"):
            try:
                content = self.store.read_page(source_id, "source")
                if f"[[{page_id}]]" in content:
                    metadata = self._extract_metadata(content)
                    backlinks.append({
                        "id": source_id,
                        "kind": "source",
                        "title": metadata.get("title", source_id)
                    })
            except Exception:
                pass
        
        for entity_id in self.store.list_pages("entity"):
            try:
                content = self.store.read_page(entity_id, "entity")
                if f"[[{page_id}]]" in content:
                    metadata = self._extract_metadata(content)
                    backlinks.append({
                        "id": entity_id,
                        "kind": "entity",
                        "title": metadata.get("title", entity_id)
                    })
            except Exception:
                pass
        
        for concept_id in self.store.list_pages("concept"):
            try:
                content = self.store.read_page(concept_id, "concept")
                if f"[[{page_id}]]" in content:
                    metadata = self._extract_metadata(content)
                    backlinks.append({
                        "id": concept_id,
                        "kind": "concept",
                        "title": metadata.get("title", concept_id)
                    })
            except Exception:
                pass
        
        return backlinks