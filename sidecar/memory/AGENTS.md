# Delfin Memory Wiki - Agent Conventions

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

## Entity Types

- **person**: Individuals (e.g., "Alan Turing")
- **place**: Locations (e.g., "Cambridge University")
- **concept**: Ideas and theories (e.g., "Backpropagation")
- **product**: Tools and software (e.g., "Delfin")
- **event**: Specific occurrences (e.g., "Turing Test")
- **other**: Anything that doesn't fit the above categories

## Content Guidelines

1. **Sources**: Should contain the raw material with minimal interpretation
2. **Entities**: Should focus on factual information about the specific entity
3. **Concepts**: Should explain ideas clearly with examples where helpful

## Naming Conventions

- Use title case for page titles
- Use lowercase-with-hyphens for file names
- Be specific rather than generic
- Prefer "Backpropagation Algorithm" over "Neural Network Training"

## Cross-Referencing

Always link to related pages using wikilinks when appropriate. This helps build the knowledge graph.

## Update Strategy

When updating existing pages:
- Preserve the original content
- Add new information in a new section
- Note the update date in the frontmatter
- Reference the source of new information

## Error Handling

If you encounter ambiguous or conflicting information:
1. Note the conflict in the page content
2. Reference all relevant sources
3. Add a "Conflicts" section if needed
4. Let the user resolve ambiguities

## Example Page

```markdown
---
id: backpropagation
title: Backpropagation Algorithm
kind: concept
created: 2024-04-23
updated: 2024-04-23
source_ids: [session-001, lecture-slide-42]
tags: [machine-learning, neural-networks, algorithms]
---

# Backpropagation Algorithm

Backpropagation is a supervised learning algorithm used for training artificial neural networks. It calculates the gradient of the loss function with respect to the weights of the network.

## Key Concepts

- **Forward Pass**: Compute predictions
- **Loss Calculation**: Measure error
- **Backward Pass**: Calculate gradients
- **Weight Update**: Adjust parameters

## Mathematical Formulation

The algorithm uses the chain rule from calculus to efficiently compute gradients through the network layers.

## Related Concepts

- [[Gradient Descent]]
- [[Neural Networks]]
- [[Loss Functions]]

## References

- Session 001: Introduction to Deep Learning
- Lecture Slide 42: Training Neural Networks
```

## Technical Implementation Notes

This section documents key technical decisions for developers maintaining the system.

### Ingest Pipeline Design

1. **Synchronous Execution**: The ingest pipeline runs synchronously to ensure data consistency and simplify error handling. Future enhancement will add background job processing using `asyncio.Task`.

2. **Retry Strategy**: LLM calls use a 2-attempt retry with prompt augmentation. Failed responses are appended to the prompt to give the model a chance to self-correct.

3. **Progress Tracking**: Callback-based design allows flexible UI integration. Ready for WebSocket progress events when implemented.

4. **Error Handling**: Comprehensive exception handling ensures failed ingests leave no partial artifacts and log detailed error information.

5. **Idempotent Operations**: Safe to run multiple times on the same session. Checks for existing pages before creation to avoid duplicates.

### API Design Decisions

1. **RESTful Conventions**: Follows standard REST patterns with consistent JSON response formats.

2. **Singleton Pipeline**: Global ingest pipeline instance initialized during FastAPI lifespan for engine access efficiency.

3. **XDG Compliance**: Uses XDG directory standards for cross-platform compatibility.

4. **Development Flexibility**: CORS allowed from all origins during development phase.

### Frontend Architecture

1. **Polling Strategy**: Uses `setInterval` for progress updates (5s interval) during development.

2. **Mock Data**: Simulates ingest process to demonstrate UI flow without full backend.

3. **Local State**: Component-level state management sufficient for current requirements.

4. **Error Handling**: Graceful degradation with user-friendly error messages.

## User Instructions

You can modify this file to change how the AI agents maintain your wiki. Changes will take effect the next time an ingest operation runs.