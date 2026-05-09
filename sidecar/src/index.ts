import express, { type Express } from "express";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { FileSessionRepository } from "./app/session/repositories/file-session-repository";
import { SessionServiceImpl } from "./app/session/domain/services/session-service-impl";
import { createSessionRoutes } from "./app/session/controllers/routes";
import { httpExpectionHandler } from "./shared/middleware/http-expection-handler";
import { NotFoundException } from "./shared/exceptions";
import { getCurrentUTCDate } from "./shared/utils/date";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "../..");
config({ path: resolve(rootDir, ".env") });

const app: Express = express();
const PORT = process.env.SIDECAR_PORT || 8321;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const repository = new FileSessionRepository(
  resolve(rootDir, "sidecar/data/sessions"),
);
const sessionService = new SessionServiceImpl(repository);
const sessionRoutes = createSessionRoutes(sessionService);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: getCurrentUTCDate().toISOString() });
});

app.use("/sessions", sessionRoutes);

app.use((_req, _res, next) => {
  next(new NotFoundException("Route not found"));
});

app.use(httpExpectionHandler);

app.listen(PORT, () => {
  console.log(`Sidecar server running on http://localhost:${PORT}`);
});
