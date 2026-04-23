"""Memory logbook — operation logging for the wiki system."""

import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .xdg_utils import resolve_memory_dir


class LogEntry:
    """Represents a single log entry."""
    
    def __init__(self, timestamp: str, operation: str, subject: str, detail: str = ""):
        self.timestamp = timestamp
        self.operation = operation
        self.subject = subject
        self.detail = detail
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp,
            "operation": self.operation,
            "subject": self.subject,
            "detail": self.detail
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'LogEntry':
        """Create from dictionary."""
        return cls(
            timestamp=data.get("timestamp", ""),
            operation=data.get("operation", ""),
            subject=data.get("subject", ""),
            detail=data.get("detail", "")
        )


class Logbook:
    """Handles wiki operation logging."""
    
    def __init__(self, memory_dir: Optional[str] = None):
        """Initialize the logbook."""
        self.memory_dir = resolve_memory_dir(memory_dir)
        self.wiki_dir = self.memory_dir / "wiki"
        self.log_file = self.wiki_dir / "log.md"
        self._ensure_log_exists()
    
    def _ensure_log_exists(self) -> None:
        """Ensure the log file exists with proper header."""
        if not self.log_file.exists():
            self.wiki_dir.mkdir(parents=True, exist_ok=True)
            self.log_file.write_text("# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n\n")
    
    def append_log(self, operation: str, subject: str, detail: str = "") -> None:
        """Append a log entry to the wiki log."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        
        # Read existing content
        if self.log_file.exists():
            existing_content = self.log_file.read_text()
        else:
            existing_content = "# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n\n"
        
        # Create new entry
        entry = f"\n## [{timestamp}] {operation} | {subject}\n"
        if detail:
            entry += f"{detail}\n"
        
        # Append to file
        with open(self.log_file, 'w', encoding='utf-8') as f:
            f.write(existing_content + entry)
    
    def read_log(self, limit: int = 50) -> List[LogEntry]:
        """Read the last N log entries, newest first."""
        if not self.log_file.exists():
            return []
        
        content = self.log_file.read_text()
        lines = content.split('\n')
        
        entries = []
        current_entry = None
        
        for line in lines:
            if line.startswith('## ['):
                # This is a new entry header
                if current_entry:
                    entries.append(current_entry)
                
                # Parse header: ## [timestamp] operation | subject
                header_parts = line[4:].split(']')  # Remove ## [
                if len(header_parts) >= 2:
                    timestamp_part = header_parts[0]
                    rest = header_parts[1].strip()
                    
                    # Split operation | subject
                    if '|' in rest:
                        op_subject = rest.split('|', 1)
                        operation = op_subject[0].strip()
                        subject = op_subject[1].strip() if len(op_subject) > 1 else ""
                        
                        current_entry = LogEntry(
                            timestamp=timestamp_part,
                            operation=operation,
                            subject=subject,
                            detail=""
                        )
                    else:
                        current_entry = LogEntry(
                            timestamp=timestamp_part,
                            operation=rest,
                            subject="",
                            detail=""
                        )
            elif current_entry and line.strip():
                # This is detail content for the current entry
                if current_entry.detail:
                    current_entry.detail += "\n" + line
                else:
                    current_entry.detail = line
        
        # Add the last entry if it exists
        if current_entry:
            entries.append(current_entry)
        
        # Return newest first (reverse chronological order)
        return entries[-limit:][::-1] if limit else entries[::-1]
    
    def get_recent_entries(self, limit: int = 10) -> List[LogEntry]:
        """Get recent log entries."""
        return self.read_log(limit)
    
    def clear_log(self) -> None:
        """Clear the log file (keep header)."""
        header = "# Memory Wiki Operation Log\n\nThis file records all operations performed on the wiki.\n\n"
        with open(self.log_file, 'w', encoding='utf-8') as f:
            f.write(header)
    
    def get_log_stats(self) -> dict:
        """Get statistics about the log."""
        entries = self.read_log()
        return {
            "total_entries": len(entries),
            "operations": list(set(entry.operation for entry in entries)),
            "first_entry": entries[-1].timestamp if entries else None,
            "last_entry": entries[0].timestamp if entries else None
        }