#include "turn_runner/turn_runner.h"

#include <utility>

#include "absl/time/time.h"
#include "runtime/util/status_macros.h"

namespace delfin::bridge {

using ::litert::lm::Message;

absl::Status TurnRunner::RunGenerateTurn(
    litert::lm::Engine& engine, SessionRegistry& session_registry,
    const GenerateTurn& turn,
    const std::function<void(ordered_json)>& emit_event) {
  if (turn.turn_id.empty()) return absl::InvalidArgumentError("requestId is required");
  if (turn.session_id.empty()) return absl::InvalidArgumentError("sessionId is required");

  if (MessageHasContentType(turn.message, "audio") &&
      !engine.GetEngineSettings().GetAudioExecutorSettings().has_value()) {
    return absl::InvalidArgumentError(
        "Audio input is disabled for this LiteRT C++ bridge.");
  }

  std::lock_guard<std::mutex> generation_lock(generation_mutex_);
  ASSIGN_OR_RETURN(auto* conversation,
                   session_registry.AcquireConversation(
                       engine, turn.session_id, turn.system_prompt));
  session_registry.RegisterActiveTurn(turn.turn_id, turn.session_id, conversation);

  std::string full_text;
  auto callback = [&](absl::StatusOr<Message> maybe_message) {
    if (!maybe_message.ok()) {
      emit_event(BuildErrorEvent(turn.turn_id,
                                 std::string(maybe_message.status().message())));
      return;
    }
    const std::string token = ExtractText(*maybe_message);
    if (token.empty()) return;
    full_text += token;
    emit_event(BuildTokenEvent(turn.turn_id, token));
  };

  absl::Status status = conversation->SendMessageAsync(
      turn.message, std::move(callback), {.task_group_id = turn.turn_id});
  if (!status.ok()) {
    session_registry.EraseActiveTurn(turn.turn_id);
    session_registry.ReleaseConversation(turn.session_id);
    return status;
  }

  status = engine.WaitUntilDone(absl::Seconds(timeout_seconds_));
  session_registry.EraseActiveTurn(turn.turn_id);
  session_registry.ReleaseConversation(turn.session_id);
  if (!status.ok()) return status;

  emit_event(BuildDoneEvent(turn.turn_id, full_text));
  return absl::OkStatus();
}

}  // namespace delfin::bridge
