#include "app.h"

#include <iostream>
#include <thread>

#include "absl/status/status.h"
#include "protocol/bridge_protocol.h"

namespace delfin::bridge {

App::App(std::unique_ptr<litert::lm::Engine> engine, int timeout_seconds,
         const std::string& model_path)
    : engine_(std::move(engine)),
      turn_runner_(timeout_seconds),
      model_path_(model_path) {}

void App::EmitEvent(ordered_json event) {
  std::lock_guard<std::mutex> lock(output_mutex_);
  std::cout << event.dump() << std::endl;
}

void App::Run() {
  EmitEvent(BuildReadyEvent("litert-cpp", model_path_));
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty()) HandleLine(line);
  }
}

void App::HandleLine(const std::string& line) {
  auto parsed_or = ParseTurnCommand(line);
  if (!parsed_or.ok()) {
    EmitEvent(BuildErrorEvent("", std::string(parsed_or.status().message())));
    return;
  }

  const TurnCommand command = *parsed_or;
  if (std::holds_alternative<InterruptTurn>(command)) {
    const auto& turn = std::get<InterruptTurn>(command);
    session_registry_.Interrupt(turn.turn_id);
    return;
  }

  if (std::holds_alternative<ResetSessionTurn>(command)) {
    const auto& turn = std::get<ResetSessionTurn>(command);
    session_registry_.ResetSession(turn.session_id);
    return;
  }

  if (std::holds_alternative<UnsupportedTurn>(command)) {
    const auto& turn = std::get<UnsupportedTurn>(command);
    EmitEvent(BuildErrorEvent(turn.turn_id, turn.message));
    return;
  }

  const auto turn = std::get<GenerateTurn>(command);
  std::thread([this, turn]() {
    const absl::Status status = turn_runner_.RunGenerateTurn(
        *engine_, session_registry_, turn,
        [this](ordered_json event) { EmitEvent(std::move(event)); });
    if (!status.ok()) {
      EmitEvent(BuildErrorEvent(turn.turn_id, std::string(status.message())));
    }
  }).detach();
}

}  // namespace delfin::bridge
