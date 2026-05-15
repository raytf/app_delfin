import { describe, expect, it } from "vitest";

import { ConfigService, deriveSidecarWsUrl } from "./config-service";

describe("deriveSidecarWsUrl", () => {
  it("derives a ws:// endpoint from an http:// base URL", () => {
    expect(deriveSidecarWsUrl("http://localhost:8321")).toBe(
      "ws://localhost:8321/ws",
    );
  });

  it("derives a wss:// endpoint from an https:// base URL", () => {
    expect(deriveSidecarWsUrl("https://example.com:8321")).toBe(
      "wss://example.com:8321/ws",
    );
  });

  it("works for a WSL2 IP host", () => {
    expect(deriveSidecarWsUrl("http://172.20.1.5:8321")).toBe(
      "ws://172.20.1.5:8321/ws",
    );
  });

  it("forces the /ws path regardless of the base URL's path", () => {
    expect(deriveSidecarWsUrl("http://localhost:8321/")).toBe(
      "ws://localhost:8321/ws",
    );
    expect(deriveSidecarWsUrl("http://localhost:8321/foo")).toBe(
      "ws://localhost:8321/ws",
    );
  });
});

describe("ConfigService runtime", () => {
  it("defaults SIDECAR_URL and derives the WebSocket URL when env is empty", () => {
    const { sidecarUrl, sidecarWsUrl } = new ConfigService({}).runtime;
    expect(sidecarUrl).toBe("http://localhost:8321");
    expect(sidecarWsUrl).toBe("ws://localhost:8321/ws");
  });

  it("derives the WebSocket URL from an explicit SIDECAR_URL", () => {
    const { sidecarUrl, sidecarWsUrl } = new ConfigService({
      SIDECAR_URL: "http://172.20.1.5:8321",
    }).runtime;
    expect(sidecarUrl).toBe("http://172.20.1.5:8321");
    expect(sidecarWsUrl).toBe("ws://172.20.1.5:8321/ws");
  });
});
