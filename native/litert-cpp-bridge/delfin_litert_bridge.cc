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
#include "runtime/engine/engine.h"
#include "runtime/engine/engine_factory.h"
#include "runtime/engine/engine_settings.h"
#include "runtime/util/status_macros.h"

ABSL_FLAG(std::string, backend, "cpu", "LiteRT backend: cpu, gpu, npu, ...");
ABSL_FLAG(std::string, model_path, "", "Path to the .litertlm model file.");
ABSL_FLAG(int, timeout_seconds, 600, "Generation timeout per request.");

namespace {
using ::litert::lm::Backend;
using ::litert::lm::Conversation;
using ::litert::lm::ConversationConfig;
using ::litert::lm::Engine;
using ::litert::lm::EngineSettings;
using ::litert::lm::Message;
using ::litert::lm::ModelAssets;
using ::nlohmann::ordered_json;

std::mutex g_output_mutex;
std::mutex g_active_mutex;
std::mutex g_generation_mutex;
std::unordered_map<std::string, Conversation*> g_active;

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
  ASSIGN_OR_RETURN(EngineSettings settings,
                   EngineSettings::CreateDefault(std::move(model_assets), backend));
  return litert::lm::EngineFactory::CreateAny(std::move(settings));
}

absl::StatusOr<std::unique_ptr<Conversation>> CreateConversation(Engine& engine) {
  auto session_config = litert::lm::SessionConfig::CreateDefault();
  ASSIGN_OR_RETURN(auto config,
                   ConversationConfig::Builder().SetSessionConfig(session_config).Build(engine));
  return Conversation::Create(engine, config);
}

absl::Status Generate(Engine& engine, const ordered_json& request) {
  const std::string request_id = request.value("requestId", "");
  if (request_id.empty()) return absl::InvalidArgumentError("requestId is required");
  if (!request.contains("messages") || !request["messages"].is_array()) {
    return absl::InvalidArgumentError("messages array is required");
  }

  std::lock_guard<std::mutex> generation_lock(g_generation_mutex);
  ASSIGN_OR_RETURN(auto conversation, CreateConversation(engine));
  {
    std::lock_guard<std::mutex> lock(g_active_mutex);
    g_active[request_id] = conversation.get();
  }

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
      request["messages"], std::move(callback), {.task_group_id = request_id});
  if (!status.ok()) {
    EraseActive(request_id);
    return status;
  }
  status = engine.WaitUntilDone(absl::Seconds(absl::GetFlag(FLAGS_timeout_seconds)));
  EraseActive(request_id);
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
  it->second->CancelGroup(request_id);
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
