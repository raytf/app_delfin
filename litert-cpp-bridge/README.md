# LiteRT C++ Bridge

This folder is a structured reimplementation of the bridge with the same JSONL
runtime protocol as `native/litert-cpp-bridge/`.

## Layout

- `main.cc`: process entrypoint and flag wiring.
- `app.*`: line loop + turn dispatch + event emission.
- `protocol/bridge_protocol.*`: supported turn declarations and JSON parsing/event builders.
- `engine/litert_engine_factory.*`: LiteRT engine construction.
- `conversation_registry/conversation_registry.*`: conversation lifecycle and active-turn bookkeeping.
- `turn_runner/turn_runner.*`: execute one generate turn and stream token/done events.

## Protocol naming

Types in C++ use turn-oriented naming for generation (`GenerateTurn`,
`InterruptTurn`) and conversation lifecycle naming (`CreateConversation`,
`DropConversation`, `ResetConversation`).
