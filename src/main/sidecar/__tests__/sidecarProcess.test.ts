import { beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());
const chmodSyncMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  chmodSync: chmodSyncMock,
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("node:http", () => ({
  get: getMock,
}));

// Must reset module cache so each test re-imports the module with fresh state
beforeEach(async () => {
  vi.resetModules();
  existsSyncMock.mockReset();
  spawnMock.mockReset();
  chmodSyncMock.mockReset();
  getMock.mockReset();
  (process as any).resourcesPath = "/fake/Resources";
});

async function loadModule() {
  return import("../sidecarProcess");
}

describe("startSidecar", () => {
  it("returns failure when the frozen binary is missing and no sidecar is running", async () => {
    existsSyncMock.mockReturnValue(false);
    getMock.mockImplementation((_url: string, _opts: any, callback: any) => {
      const req = { on: vi.fn(), destroy: vi.fn() } as any;
      setTimeout(() => req.on.mock.calls.find((c: any[]) => c[0] === "error")?.[1]?.(), 0);
      return req;
    });
    const { startSidecar } = await loadModule();
    const result = await startSidecar();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Frozen sidecar binary not found.");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("reuses an existing sidecar when /health responds", async () => {
    getMock.mockImplementation((_url: string, _opts: any, callback: any) => {
      const res = { statusCode: 200, resume: vi.fn() } as any;
      const req = { on: vi.fn(), destroy: vi.fn() } as any;
      setTimeout(() => callback(res), 0);
      return req;
    });
    const { startSidecar } = await loadModule();
    const result = await startSidecar();
    expect(result.success).toBe(true);
    expect(result.url).toContain("/ws");
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
