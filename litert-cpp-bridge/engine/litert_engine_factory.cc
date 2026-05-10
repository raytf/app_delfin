#include "engine/litert_engine_factory.h"

#include "runtime/engine/engine_factory.h"
#include "runtime/engine/engine_settings.h"
#include "runtime/util/status_macros.h"

namespace delfin::bridge {

using ::litert::lm::Backend;
using ::litert::lm::Engine;
using ::litert::lm::EngineSettings;
using ::litert::lm::ModelAssets;

absl::StatusOr<std::unique_ptr<Engine>> CreateEngine(const EngineOptions& options) {
  if (options.model_path.empty()) {
    return absl::InvalidArgumentError("model_path is empty");
  }

  ASSIGN_OR_RETURN(ModelAssets model_assets, ModelAssets::Create(options.model_path));
  ASSIGN_OR_RETURN(Backend backend, litert::lm::GetBackendFromString(options.backend));
  ASSIGN_OR_RETURN(Backend vision_backend,
                   litert::lm::GetBackendFromString(options.vision_backend));

  std::optional<Backend> audio_backend;
  if (options.audio_backend != "none") {
    ASSIGN_OR_RETURN(Backend parsed,
                     litert::lm::GetBackendFromString(options.audio_backend));
    audio_backend = parsed;
  }

  ASSIGN_OR_RETURN(EngineSettings settings,
                   EngineSettings::CreateDefault(std::move(model_assets), backend,
                                                 vision_backend, audio_backend));
  return litert::lm::EngineFactory::CreateDefault(std::move(settings));
}

}  // namespace delfin::bridge
