#ifndef DELFIN_LITERT_CPP_BRIDGE_PROTOCOL_BRIDGE_PROTOCOL_H_
#define DELFIN_LITERT_CPP_BRIDGE_PROTOCOL_BRIDGE_PROTOCOL_H_

#include <string>
#include <variant>

#include "absl/status/statusor.h"
#include "nlohmann/json.hpp"
#include "runtime/conversation/io_types.h"

namespace delfin::bridge
{

  using ::litert::lm::Message;
  using ::nlohmann::ordered_json;

  inline constexpr char kTurnTypeGenerate[] = "generate";
  inline constexpr char kTurnTypeInterrupt[] = "interrupt";
  inline constexpr char kTurnTypeCreateConversation[] = "create_conversation";
  inline constexpr char kTurnTypeDropConversation[] = "drop_conversation";
  inline constexpr char kTurnTypeResetConversation[] = "reset_conversation";

  inline constexpr char kEventTypeReady[] = "ready";
  inline constexpr char kEventTypeToken[] = "token";
  inline constexpr char kEventTypeDone[] = "done";
  inline constexpr char kEventTypeError[] = "error";

  struct GenerateTurn
  {
    std::string turn_id;
    std::string conversation_id;
    std::string system_prompt;
    ordered_json message;
  };

  struct InterruptTurn
  {
    std::string turn_id;
  };

  struct CreateConversation
  {
    std::string conversation_id;
    std::string system_prompt;
  };

  struct DropConversation
  {
    std::string conversation_id;
  };

  struct ResetConversation
  {
    std::string conversation_id;
  };

  struct UnsupportedTurn
  {
    std::string turn_id;
    std::string message;
  };

  using TurnCommand =
      std::variant<GenerateTurn, InterruptTurn, CreateConversation,
                   DropConversation, ResetConversation,
                   UnsupportedTurn>;

  absl::StatusOr<TurnCommand> ParseTurnCommand(const std::string &line);

  ordered_json BuildReadyEvent(const std::string &backend, const std::string &model);
  ordered_json BuildTokenEvent(const std::string &turn_id, const std::string &text);
  ordered_json BuildDoneEvent(const std::string &turn_id, const std::string &text);
  ordered_json BuildErrorEvent(const std::string &turn_id, const std::string &message);

  std::string ExtractText(const Message &message);
  bool MessageHasContentType(const ordered_json &message, const std::string &content_type);

} // namespace delfin::bridge

#endif // DELFIN_LITERT_CPP_BRIDGE_PROTOCOL_BRIDGE_PROTOCOL_H_
