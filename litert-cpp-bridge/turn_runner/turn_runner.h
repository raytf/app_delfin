#ifndef DELFIN_LITERT_CPP_BRIDGE_TURN_RUNNER_H_
#define DELFIN_LITERT_CPP_BRIDGE_TURN_RUNNER_H_

#include <functional>
#include <mutex>
#include <string>

#include "absl/status/status.h"
#include "protocol/bridge_protocol.h"
#include "conversation_registry/conversation_registry.h"
#include "runtime/engine/engine.h"

namespace delfin::bridge {

class TurnRunner {
 public:
  explicit TurnRunner(int timeout_seconds) : timeout_seconds_(timeout_seconds) {}

  absl::Status RunGenerateTurn(
      litert::lm::Engine& engine, ConversationRegistry& conversation_registry,
      const GenerateTurn& turn,
      const std::function<void(ordered_json)>& emit_event);

 private:
  int timeout_seconds_;
  std::mutex generation_mutex_;
};

}  // namespace delfin::bridge

#endif  // DELFIN_LITERT_CPP_BRIDGE_TURN_RUNNER_H_
