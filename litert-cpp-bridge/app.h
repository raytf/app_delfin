#ifndef DELFIN_LITERT_CPP_BRIDGE_APP_H_
#define DELFIN_LITERT_CPP_BRIDGE_APP_H_

#include <memory>
#include <mutex>
#include <string>

#include "turn_runner/turn_runner.h"
#include "session_registry/session_registry.h"
#include "runtime/engine/engine.h"

namespace delfin::bridge {

class App {
 public:
  App(std::unique_ptr<litert::lm::Engine> engine, int timeout_seconds,
      const std::string& model_path);
  void Run();
  void HandleLine(const std::string& line);

 private:
  void EmitEvent(ordered_json event);

  std::unique_ptr<litert::lm::Engine> engine_;
  TurnRunner turn_runner_;
  SessionRegistry session_registry_;
  std::string model_path_;
  std::mutex output_mutex_;
};

}  // namespace delfin::bridge

#endif  // DELFIN_LITERT_CPP_BRIDGE_APP_H_
