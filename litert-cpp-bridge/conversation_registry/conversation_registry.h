#ifndef DELFIN_LITERT_CPP_BRIDGE_CONVERSATION_REGISTRY_H_
#define DELFIN_LITERT_CPP_BRIDGE_CONVERSATION_REGISTRY_H_

#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include "absl/status/statusor.h"
#include "runtime/conversation/conversation.h"
#include "runtime/engine/engine.h"

namespace delfin::bridge {

class ConversationRegistry {
 public:
  absl::StatusOr<litert::lm::Conversation*> AcquireConversation(
      litert::lm::Engine& engine, const std::string& conversation_id,
      const std::string& system_prompt);
  void ReleaseConversation(const std::string& conversation_id);

  void RegisterActiveTurn(const std::string& turn_id,
                          const std::string& conversation_id,
                          litert::lm::Conversation* conversation);
  void EraseActiveTurn(const std::string& turn_id);
  void Interrupt(const std::string& turn_id);
  void DropConversation(const std::string& conversation_id);

 private:
  struct ActiveTurn {
    std::string conversation_id;
    litert::lm::Conversation* conversation = nullptr;
  };

  struct ConversationEntry {
    std::unique_ptr<litert::lm::Conversation> conversation;
    int active_turns = 0;
    bool reset_pending = false;
  };

  std::mutex active_mutex_;
  std::mutex conversations_mutex_;
  std::unordered_map<std::string, ActiveTurn> active_turns_;
  std::unordered_map<std::string, ConversationEntry> conversations_;
};

}  // namespace delfin::bridge

#endif  // DELFIN_LITERT_CPP_BRIDGE_CONVERSATION_REGISTRY_H_
