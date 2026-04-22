import { beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());
const chmodSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  chmodSync: chmodSyncMock,
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

// Must reset module cache so each test re-imports the module with fresh state
beforeEach(async () => {
  vi.resetModules();
  existsSyncMock.mockReset();
  spawnMock.mockReset();
  chmodSyncMock.mockReset();
  (process as any).resourcesPath = "/fake/Resources";
});

async function loadModule() {
  return import("../sidecarProcess");
}

describe("startSidecar", () => {
  it("returns failure when the frozen binary is missing", async () => {
    existsSyncMock.mockReturnValue(false);
    const { startSidecar } = await loadModule();
    const result = startSidecar();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Frozen sidecar binary not found.");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("stopSidecar", () => {
  it("is a no-op when no sidecar is running", async () => {
    existsSyncMock.mockReturnValue(false);
    const { stopSidecar } = await loadModule();
    expect(() => stopSidecar()).not.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
