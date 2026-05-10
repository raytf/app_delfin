import express, { type Express } from 'express';
import { config } from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { FileSessionRepository } from './app/session/repositories/file-session-repository';
import { SessionServiceImpl } from './app/session/domain/services/session-service-impl';
import { createSessionRoutes } from './app/session/controllers/routes';
import { TurnServiceImpl } from './app/turn/domain/services/turn-service-impl';
import { TurnController } from './app/turn/controllers/turn-controller';
import { LitertCppInferenceEngine } from './external/inference-engine/litert-cpp-inference-engine';
import { PiperTtsEngine } from './external/tts/piper-tts-engine';
import { ConfigService } from './config/config-service';
import { httpExpectionHandler } from './shared/middleware/http-expection-handler';
import { NotFoundException } from './shared/exceptions';
import { getCurrentUTCDate } from './shared/utils/date';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');
config({ path: resolve(rootDir, '.env') });

const configService = new ConfigService(rootDir);

const app: Express = express();
const PORT = configService.runtime.port;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const repository = new FileSessionRepository(resolve(rootDir, 'sidecar/data/sessions'));
const inferenceEngine = new LitertCppInferenceEngine({
  binPath: configService.inference.bridgeBinPath,
  modelPath: configService.inference.modelPath,
  rootDir,
});
const sessionService = new SessionServiceImpl(repository, inferenceEngine);
const sessionRoutes = createSessionRoutes(sessionService);
const ttsEngine = PiperTtsEngine.fromConfig(configService);
const turnService = new TurnServiceImpl(sessionService, inferenceEngine, ttsEngine);
const turnController = new TurnController(turnService, inferenceEngine);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: getCurrentUTCDate().toISOString(),
    engine: inferenceEngine.getInfo(),
  });
});

app.use('/sessions', sessionRoutes);

app.use((_req, _res, next) => {
  next(new NotFoundException('Route not found'));
});

app.use(httpExpectionHandler);

const server = createServer(app);
const wsServer = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (ws) => {
    turnController.registerConnection(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Sidecar server running on http://localhost:${PORT}`);
});

const shutdown = async (): Promise<void> => {
  await inferenceEngine.close();
  server.close();
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
