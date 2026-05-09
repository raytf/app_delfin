#include "session_registry/session_registry.h"

#include "absl/status/status.h"
#include "runtime/conversation/io_types.h"
#include "runtime/util/status_macros.h"

namespace delfin::bridge {

using ::litert::lm::Conversation;
using ::litert::lm::ConversationConfig;
using ::litert::lm::Engine;
using ::litert::lm::JsonPreface;
using ::litert::lm::SessionConfig;
using ::nlohmann::ordered_json;

namespace {
absl::StatusOr<std::unique_ptr<Conversation>> CreateConversation(
    Engine& engine, const std::string& system_prompt) {
  auto session_config = SessionConfig::CreateDefault();
  session_config.SetVisionModalityEnabled(
      engine.GetEngineSettings().GetVisionExecutorSettings().has_value());
  session_config.SetAudioModalityEnabled(
      engine.GetEngineSettings().GetAudioExecutorSettings().has_value());

  auto builder = ConversationConfig::Builder().SetSessionConfig(session_config);
  if (!system_prompt.empty()) {
    JsonPreface preface;
    preface.messages = ordered_json::array(
        {{{"role", "system"}, {"content", system_prompt}}});
    builder.SetPreface(preface);
  }

  ASSIGN_OR_RETURN(auto config, builder.Build(engine));
  return Conversation::Create(engine, config);
}
}  // namespace

absl::StatusOr<Conversation*> SessionRegistry::AcquireConversation(
    Engine& engine, const std::string& session_id,
    const std::string& system_prompt) {
  if (session_id.empty()) {
    return absl::InvalidArgumentError("sessionId is required");
  }

  std::lock_guard<std::mutex> lock(sessions_mutex_);
  auto it = sessions_.find(session_id);
  if (it == sessions_.end()) {
    ASSIGN_OR_RETURN(auto conversation, CreateConversation(engine, system_prompt));
    SessionEntry entry;
    entry.conversation = std::move(conversation);
    entry.active_turns = 1;
    Conversation* raw = entry.conversation.get();
    sessions_.emplace(session_id, std::move(entry));
    return raw;
  }

  it->second.active_turns += 1;
  return it->second.conversation.get();
}

void SessionRegistry::ReleaseConversation(const std::string& session_id) {
  if (session_id.empty()) return;

  std::lock_guard<std::mutex> lock(sessions_mutex_);
  auto it = sessions_.find(session_id);
  if (it == sessions_.end()) return;

  if (it->second.active_turns > 0) {
    it->second.active_turns -= 1;
  }
  if (it->second.active_turns == 0 && it->second.reset_pending) {
    sessions_.erase(it);
  }
}

void SessionRegistry::RegisterActiveTurn(const std::string& turn_id,
                                         const std::string& session_id,
                                         Conversation* conversation) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  active_turns_[turn_id] = ActiveTurn{session_id, conversation};
}

void SessionRegistry::EraseActiveTurn(const std::string& turn_id) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  active_turns_.erase(turn_id);
}

void SessionRegistry::Interrupt(const std::string& turn_id) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  auto it = active_turns_.find(turn_id);
  if (it == active_turns_.end()) return;
  if (it->second.conversation == nullptr) return;
  it->second.conversation->CancelGroup(turn_id);
}

void SessionRegistry::ResetSession(const std::string& session_id) {
  if (session_id.empty()) return;

  std::lock_guard<std::mutex> lock(sessions_mutex_);
  auto it = sessions_.find(session_id);
  if (it == sessions_.end()) return;
  if (it->second.active_turns > 0) {
    it->second.reset_pending = true;
    return;
  }
  sessions_.erase(it);
}

}  // namespace delfin::bridge
