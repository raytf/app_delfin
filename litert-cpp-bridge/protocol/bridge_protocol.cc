#include "protocol/bridge_protocol.h"

#include "absl/status/status.h"

namespace delfin::bridge {

absl::StatusOr<TurnCommand> ParseTurnCommand(const std::string& line) {
  ordered_json root;
  try {
    root = ordered_json::parse(line);
  } catch (const std::exception& e) {
    return absl::InvalidArgumentError(e.what());
  }

  const std::string type = root.value("type", "");
  if (type == kTurnTypeGenerate) {
    if (!root.contains("requestId") || !root["requestId"].is_string()) {
      return absl::InvalidArgumentError("requestId is required");
    }
    if (!root.contains("sessionId") || !root["sessionId"].is_string()) {
      return absl::InvalidArgumentError("sessionId is required");
    }
    if (!root.contains("message") || !root["message"].is_object()) {
      return absl::InvalidArgumentError("message object is required");
    }
    GenerateTurn turn;
    turn.turn_id = root["requestId"].get<std::string>();
    turn.session_id = root["sessionId"].get<std::string>();
    turn.system_prompt = root.value("systemPrompt", "");
    turn.message = root["message"];
    return turn;
  }

  if (type == kTurnTypeInterrupt) {
    InterruptTurn turn;
    turn.turn_id = root.value("requestId", "");
    return turn;
  }

  if (type == kTurnTypeResetSession) {
    ResetSessionTurn turn;
    turn.session_id = root.value("sessionId", "");
    return turn;
  }

  UnsupportedTurn turn;
  turn.turn_id = root.value("requestId", "");
  turn.message = "Unsupported request type";
  return turn;
}

ordered_json BuildReadyEvent(const std::string& backend, const std::string& model) {
  return {{"type", kEventTypeReady}, {"backend", backend}, {"model", model}};
}

ordered_json BuildTokenEvent(const std::string& turn_id, const std::string& text) {
  return {{"type", kEventTypeToken}, {"requestId", turn_id}, {"text", text}};
}

ordered_json BuildDoneEvent(const std::string& turn_id, const std::string& text) {
  ordered_json assistant_message = {
      {"role", "model"},
      {"content", ordered_json::array({{{"type", "text"}, {"text", text}}})},
  };
  return {{"type", kEventTypeDone},
          {"requestId", turn_id},
          {"text", text},
          {"message", assistant_message}};
}

ordered_json BuildErrorEvent(const std::string& turn_id, const std::string& message) {
  return {{"type", kEventTypeError}, {"requestId", turn_id}, {"message", message}};
}

std::string ExtractText(const Message& message) {
  if (message.is_null() || message.empty() || !message.contains("content")) return "";
  std::string text;
  const auto& content = message["content"];
  if (content.is_string()) return content.get<std::string>();
  if (!content.is_array()) return "";
  for (const auto& part : content) {
    if (part.contains("type") && part["type"] == "text" && part.contains("text")) {
      text += part["text"].get<std::string>();
    }
  }
  return text;
}

bool MessageHasContentType(const ordered_json& message, const std::string& content_type) {
  if (!message.contains("content") || !message["content"].is_array()) return false;
  for (const auto& part : message["content"]) {
    if (part.contains("type") && part["type"] == content_type) return true;
  }
  return false;
}

}  // namespace delfin::bridge
