// Delfin LiteRT-LM C++ JSONL bridge.
//
// Build this inside the upstream google-ai-edge/LiteRT-LM tree. It keeps one
// LiteRT engine loaded, reads JSONL commands on stdin, and emits JSONL events on
// stdout for scripts/litert-cpp-proxy.mjs.

#include <atomic>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

#include "absl/base/log_severity.h"
#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/functional/any_invocable.h"
#include "absl/log/absl_check.h"
#include "absl/log/globals.h"
#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "absl/time/time.h"
#include "nlohmann/json.hpp"
#include "runtime/conversation/conversation.h"
#include "runtime/conversation/io_types.h"
#include "runtime/engine/engine.h"
#include "runtime/engine/engine_factory.h"
#include "runtime/engine/engine_settings.h"
#include "runtime/util/status_macros.h"

ABSL_FLAG(std::string, backend, "cpu", "LiteRT backend: cpu, gpu, npu, ...");
ABSL_FLAG(std::string, model_path, "", "Path to the .litertlm model file.");
ABSL_FLAG(int, timeout_seconds, 600, "Generation timeout per request.");
ABSL_FLAG(std::string, vision_backend, "cpu",
          "LiteRT vision backend: cpu, gpu, npu, ...");

namespace {
using ::litert::lm::Backend;
using ::litert::lm::Conversation;
using ::litert::lm::ConversationConfig;
using ::litert::lm::Engine;
using ::litert::lm::EngineSettings;
using ::litert::lm::JsonPreface;
using ::litert::lm::Message;
using ::litert::lm::ModelAssets;
using ::litert::lm::SessionConfig;
using ::nlohmann::ordered_json;

std::mutex g_output_mutex;
std::mutex g_active_mutex;
std::mutex g_sessions_mutex;
std::mutex g_generation_mutex;

struct ActiveRequest {
  std::string session_id;
  Conversation* conversation = nullptr;
};

struct SessionEntry {
  std::unique_ptr<Conversation> conversation;
  int active_requests = 0;
  bool reset_pending = false;
};

std::unordered_map<std::string, ActiveRequest> g_active;
std::unordered_map<std::string, SessionEntry> g_sessions;

void EraseActive(const std::string& request_id) {
  std::lock_guard<std::mutex> lock(g_active_mutex);
  g_active.erase(request_id);
}

void WriteEvent(ordered_json event) {
  std::lock_guard<std::mutex> lock(g_output_mutex);
  std::cout << event.dump() << std::endl;
}

std::string ExtractText(const Message& message) {
  if (message.is_null() || message.empty() || !message.contains("content")) {
    return "";
  }
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

absl::StatusOr<std::unique_ptr<Engine>> CreateEngine(const std::string& model_path) {
  if (model_path.empty()) return absl::InvalidArgumentError("model_path is empty");
  ASSIGN_OR_RETURN(ModelAssets model_assets, ModelAssets::Create(model_path));
  ASSIGN_OR_RETURN(Backend backend,
                   litert::lm::GetBackendFromString(absl::GetFlag(FLAGS_backend)));
  ASSIGN_OR_RETURN(
      Backend vision_backend,
      litert::lm::GetBackendFromString(absl::GetFlag(FLAGS_vision_backend)));
  ASSIGN_OR_RETURN(EngineSettings settings,
                   EngineSettings::CreateDefault(std::move(model_assets), backend,
                                                 vision_backend));
  return litert::lm::EngineFactory::CreateAny(std::move(settings));
}

absl::StatusOr<std::unique_ptr<Conversation>> CreateConversation(
    Engine& engine, const std::string& system_prompt) {
  auto session_config = SessionConfig::CreateDefault();
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

absl::StatusOr<Conversation*> AcquireConversation(Engine& engine,
                                                  const std::string& session_id,
                                                  const std::string& system_prompt) {
  if (session_id.empty()) return absl::InvalidArgumentError("sessionId is required");

  std::lock_guard<std::mutex> lock(g_sessions_mutex);
  auto it = g_sessions.find(session_id);
  if (it == g_sessions.end()) {
    ASSIGN_OR_RETURN(auto conversation, CreateConversation(engine, system_prompt));
    SessionEntry entry;
    entry.conversation = std::move(conversation);
    entry.active_requests = 1;
    Conversation* raw_conversation = entry.conversation.get();
    g_sessions.emplace(session_id, std::move(entry));
    return raw_conversation;
  }

  it->second.active_requests += 1;
  return it->second.conversation.get();
}

void ReleaseConversation(const std::string& session_id) {
  if (session_id.empty()) return;

  std::lock_guard<std::mutex> lock(g_sessions_mutex);
  auto it = g_sessions.find(session_id);
  if (it == g_sessions.end()) return;

  if (it->second.active_requests > 0) {
    it->second.active_requests -= 1;
  }
  if (it->second.active_requests == 0 && it->second.reset_pending) {
    g_sessions.erase(it);
  }
}

void RegisterActiveRequest(const std::string& request_id,
                           const std::string& session_id,
                           Conversation* conversation) {
  std::lock_guard<std::mutex> lock(g_active_mutex);
  ActiveRequest active_request;
  active_request.session_id = session_id;
  active_request.conversation = conversation;
  g_active[request_id] = std::move(active_request);
}

absl::Status Generate(Engine& engine, const ordered_json& request) {
  const std::string request_id = request.value("requestId", "");
  const std::string session_id = request.value("sessionId", "");
  const std::string system_prompt = request.value("systemPrompt", "");
  if (request_id.empty()) return absl::InvalidArgumentError("requestId is required");
  if (session_id.empty()) return absl::InvalidArgumentError("sessionId is required");
  if (!request.contains("message") || !request["message"].is_object()) {
    return absl::InvalidArgumentError("message object is required");
  }

  std::lock_guard<std::mutex> generation_lock(g_generation_mutex);
  ASSIGN_OR_RETURN(Conversation * conversation,
                   AcquireConversation(engine, session_id, system_prompt));
  RegisterActiveRequest(request_id, session_id, conversation);

  std::string full_text;
  auto callback = [request_id, &full_text](absl::StatusOr<Message> message) {
    if (!message.ok()) {
      WriteEvent({{"type", "error"}, {"requestId", request_id},
                  {"message", std::string(message.status().message())}});
      return;
    }
    const std::string token = ExtractText(*message);
    if (token.empty()) return;
    full_text += token;
    WriteEvent({{"type", "token"}, {"requestId", request_id}, {"text", token}});
  };

  absl::Status status = conversation->SendMessageAsync(
      request["message"], std::move(callback), {.task_group_id = request_id});
  if (!status.ok()) {
    EraseActive(request_id);
    ReleaseConversation(session_id);
    return status;
  }
  status = engine.WaitUntilDone(absl::Seconds(absl::GetFlag(FLAGS_timeout_seconds)));
  EraseActive(request_id);
  ReleaseConversation(session_id);
  if (!status.ok()) return status;

  ordered_json assistant_message = {
      {"role", "model"},
      {"content", ordered_json::array({{{"type", "text"}, {"text", full_text}}})},
  };
  WriteEvent({{"type", "done"},
              {"requestId", request_id},
              {"text", full_text},
              {"message", assistant_message}});
  return absl::OkStatus();
}

void Interrupt(const ordered_json& request) {
  const std::string request_id = request.value("requestId", "");
  std::lock_guard<std::mutex> lock(g_active_mutex);
  auto it = g_active.find(request_id);
  if (it == g_active.end()) return;
  if (it->second.conversation == nullptr) return;
  it->second.conversation->CancelGroup(request_id);
}

void ResetSession(const ordered_json& request) {
  const std::string session_id = request.value("sessionId", "");
  if (session_id.empty()) return;

  std::lock_guard<std::mutex> lock(g_sessions_mutex);
  auto it = g_sessions.find(session_id);
  if (it == g_sessions.end()) return;
  if (it->second.active_requests > 0) {
    it->second.reset_pending = true;
    return;
  }
  g_sessions.erase(it);
}

void HandleLine(Engine& engine, const std::string& line) {
  ordered_json request;
  try {
    request = ordered_json::parse(line);
  } catch (const std::exception& e) {
    WriteEvent({{"type", "error"}, {"requestId", ""}, {"message", e.what()}});
    return;
  }
  const std::string type = request.value("type", "");
  if (type == "interrupt") {
    Interrupt(request);
    return;
  }
  if (type == "reset_session") {
    ResetSession(request);
    return;
  }
  if (type != "generate") {
    WriteEvent({{"type", "error"}, {"requestId", request.value("requestId", "")},
                {"message", "Unsupported request type"}});
    return;
  }
  std::thread([&engine, request]() {
    const std::string request_id = request.value("requestId", "");
    const absl::Status status = Generate(engine, request);
    if (!status.ok()) {
      WriteEvent({{"type", "error"}, {"requestId", request_id},
                  {"message", std::string(status.message())}});
    }
  }).detach();
}

absl::Status Main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  absl::SetMinLogLevel(absl::LogSeverityAtLeast::kError);
  absl::SetStderrThreshold(absl::LogSeverityAtLeast::kFatal);

  const std::string model_path = absl::GetFlag(FLAGS_model_path);
  ASSIGN_OR_RETURN(auto engine, CreateEngine(model_path));
  WriteEvent({{"type", "ready"}, {"backend", "litert-cpp"}, {"model", model_path}});

  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty()) HandleLine(*engine, line);
  }
  return absl::OkStatus();
}
}  // namespace

int main(int argc, char** argv) {
  ABSL_CHECK_OK(Main(argc, argv));
  return 0;
}
