#include "conversation_registry/conversation_registry.h"

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
  auto conversation_config = SessionConfig::CreateDefault();
  conversation_config.SetVisionModalityEnabled(
      engine.GetEngineSettings().GetVisionExecutorSettings().has_value());
  conversation_config.SetAudioModalityEnabled(
      engine.GetEngineSettings().GetAudioExecutorSettings().has_value());

  auto builder = ConversationConfig::Builder().SetSessionConfig(conversation_config);
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

absl::StatusOr<Conversation*> ConversationRegistry::AcquireConversation(
    Engine& engine, const std::string& conversation_id,
    const std::string& system_prompt) {
  if (conversation_id.empty()) {
    return absl::InvalidArgumentError("conversationId is required");
  }

  std::lock_guard<std::mutex> lock(conversations_mutex_);
  auto it = conversations_.find(conversation_id);
  if (it == conversations_.end()) {
    ASSIGN_OR_RETURN(auto conversation, CreateConversation(engine, system_prompt));
    ConversationEntry entry;
    entry.conversation = std::move(conversation);
    entry.active_turns = 1;
    Conversation* raw = entry.conversation.get();
    conversations_.emplace(conversation_id, std::move(entry));
    return raw;
  }

  it->second.active_turns += 1;
  return it->second.conversation.get();
}

void ConversationRegistry::ReleaseConversation(const std::string& conversation_id) {
  if (conversation_id.empty()) return;

  std::lock_guard<std::mutex> lock(conversations_mutex_);
  auto it = conversations_.find(conversation_id);
  if (it == conversations_.end()) return;

  if (it->second.active_turns > 0) {
    it->second.active_turns -= 1;
  }
  if (it->second.active_turns == 0 && it->second.reset_pending) {
    conversations_.erase(it);
  }
}

void ConversationRegistry::RegisterActiveTurn(
    const std::string& turn_id, const std::string& conversation_id,
    Conversation* conversation) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  active_turns_[turn_id] = ActiveTurn{conversation_id, conversation};
}

void ConversationRegistry::EraseActiveTurn(const std::string& turn_id) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  active_turns_.erase(turn_id);
}

void ConversationRegistry::Interrupt(const std::string& turn_id) {
  std::lock_guard<std::mutex> lock(active_mutex_);
  auto it = active_turns_.find(turn_id);
  if (it == active_turns_.end()) return;
  if (it->second.conversation == nullptr) return;
  it->second.conversation->CancelGroup(turn_id);
}

void ConversationRegistry::DropConversation(const std::string& conversation_id) {
  if (conversation_id.empty()) return;

  std::lock_guard<std::mutex> lock(conversations_mutex_);
  auto it = conversations_.find(conversation_id);
  if (it == conversations_.end()) return;
  if (it->second.active_turns > 0) {
    it->second.reset_pending = true;
    return;
  }
  conversations_.erase(it);
}

}  // namespace delfin::bridge
