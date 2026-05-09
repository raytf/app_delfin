#include <memory>
#include <string>

#include "absl/base/log_severity.h"
#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/log/absl_check.h"
#include "absl/log/globals.h"
#include "absl/status/status.h"
#include "app.h"
#include "engine/litert_engine_factory.h"

ABSL_FLAG(std::string, backend, "cpu", "LiteRT backend: cpu, gpu, npu, ...");
ABSL_FLAG(std::string, model_path, "", "Path to the .litertlm model file.");
ABSL_FLAG(int, timeout_seconds, 600, "Generation timeout per request.");
ABSL_FLAG(std::string, vision_backend, "cpu",
          "LiteRT vision backend: cpu, gpu, npu, ...");
ABSL_FLAG(std::string, audio_backend, "cpu",
          "LiteRT audio backend: cpu, gpu, npu, none, ...");

namespace delfin::bridge {

absl::Status Main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  absl::SetMinLogLevel(absl::LogSeverityAtLeast::kError);
  absl::SetStderrThreshold(absl::LogSeverityAtLeast::kFatal);

  EngineOptions options;
  options.model_path = absl::GetFlag(FLAGS_model_path);
  options.backend = absl::GetFlag(FLAGS_backend);
  options.vision_backend = absl::GetFlag(FLAGS_vision_backend);
  options.audio_backend = absl::GetFlag(FLAGS_audio_backend);

  auto engine_or = CreateEngine(options);
  if (!engine_or.ok()) return engine_or.status();

  App app(std::move(*engine_or), absl::GetFlag(FLAGS_timeout_seconds),
          options.model_path);
  app.Run();
  return absl::OkStatus();
}

}  // namespace delfin::bridge

int main(int argc, char** argv) {
  ABSL_CHECK_OK(delfin::bridge::Main(argc, argv));
  return 0;
}
