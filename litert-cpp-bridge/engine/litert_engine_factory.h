#ifndef DELFIN_LITERT_CPP_BRIDGE_ENGINE_LITERT_ENGINE_FACTORY_H_
#define DELFIN_LITERT_CPP_BRIDGE_ENGINE_LITERT_ENGINE_FACTORY_H_

#include <memory>
#include <optional>
#include <string>

#include "absl/status/statusor.h"
#include "runtime/engine/engine.h"

namespace delfin::bridge {

struct EngineOptions {
  std::string model_path;
  std::string backend;
  std::string vision_backend;
  std::string audio_backend;
};

absl::StatusOr<std::unique_ptr<litert::lm::Engine>> CreateEngine(
    const EngineOptions& options);

}  // namespace delfin::bridge

#endif  // DELFIN_LITERT_CPP_BRIDGE_ENGINE_LITERT_ENGINE_FACTORY_H_
