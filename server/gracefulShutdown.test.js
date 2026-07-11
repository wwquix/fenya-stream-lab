import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createApplicationStopServices,
  createShutdownHandler,
} from "./services/gracefulShutdownService.js";

function logger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createDependencies(overrides = {}) {
  return {
    stopServices: vi.fn(),
    closeDatabase: vi.fn(),
    exit: vi.fn(),
    logger: logger(),
    timeoutMs: 100,
    httpIdleGraceMs: 10,
    httpForceGraceMs: 10,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("graceful shutdown coordinator", () => {
  test("SIGTERM stops HTTP first, then services and the database, and exits cleanly", async () => {
    const events = [];
    const server = {
      close: vi.fn((callback) => {
        events.push("http-close-started");
        queueMicrotask(() => {
          events.push("http-closed");
          callback();
          callback(new Error("duplicate callback must be ignored"));
        });
      }),
    };
    const dependencies = createDependencies({
      stopServices: vi.fn(async () => { events.push("services-stopped"); }),
      closeDatabase: vi.fn(() => { events.push("database-closed"); }),
      exit: vi.fn((code) => { events.push(`exit-${code}`); }),
    });
    const shutdown = createShutdownHandler({ server, ...dependencies });

    await shutdown("SIGTERM");

    expect(server.close).toHaveBeenCalledOnce();
    expect(dependencies.logger.log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
    expect(events.indexOf("http-close-started")).toBeLessThan(events.indexOf("services-stopped"));
    expect(events.indexOf("services-stopped")).toBeLessThan(events.indexOf("database-closed"));
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  test("SIGINT initiates the same clean shutdown path", async () => {
    const server = { close: vi.fn((callback) => callback()) };
    const dependencies = createDependencies();
    const shutdown = createShutdownHandler({ server, ...dependencies });

    await shutdown("SIGINT");

    expect(dependencies.logger.log).toHaveBeenCalledWith(expect.stringContaining("SIGINT"));
    expect(dependencies.stopServices).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  test("a second signal reuses the first shutdown and never repeats cleanup", async () => {
    let closeHttp;
    const server = { close: vi.fn((callback) => { closeHttp = callback; }) };
    const dependencies = createDependencies();
    const shutdown = createShutdownHandler({ server, ...dependencies });

    const first = shutdown("SIGTERM");
    const second = shutdown("SIGINT");
    closeHttp();

    expect(second).toBe(first);
    await first;
    expect(server.close).toHaveBeenCalledOnce();
    expect(dependencies.stopServices).toHaveBeenCalledOnce();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledOnce();
  });

  test("application service cleanup stops every producer and collects failures", async () => {
    const cleanup = {
      stopReplays: vi.fn(() => { throw new Error("replay cleanup failed"); }),
      shutdownMockSampler: vi.fn(),
      shutdownTokenRefresh: vi.fn(),
      shutdownIngest: vi.fn(),
    };
    const stopServices = createApplicationStopServices(cleanup);

    await expect(stopServices()).rejects.toThrow("application services failed to stop");
    expect(cleanup.stopReplays).toHaveBeenCalledOnce();
    expect(cleanup.shutdownMockSampler).toHaveBeenCalledOnce();
    expect(cleanup.shutdownTokenRefresh).toHaveBeenCalledOnce();
    expect(cleanup.shutdownIngest).toHaveBeenCalledOnce();
  });

  test("closes idle HTTP connections after the initial grace period", async () => {
    vi.useFakeTimers();
    let closeHttp;
    const server = {
      close: vi.fn((callback) => { closeHttp = callback; }),
      closeIdleConnections: vi.fn(() => closeHttp()),
      closeAllConnections: vi.fn(),
    };
    const dependencies = createDependencies();
    const shutdown = createShutdownHandler({ server, ...dependencies });
    const result = shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(10);
    await result;

    expect(server.closeIdleConnections).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).not.toHaveBeenCalled();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  test("uses closeAllConnections only as the final bounded HTTP fallback", async () => {
    vi.useFakeTimers();
    let closeHttp;
    const server = {
      close: vi.fn((callback) => { closeHttp = callback; }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(() => closeHttp()),
    };
    const dependencies = createDependencies();
    const shutdown = createShutdownHandler({ server, ...dependencies });
    const result = shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(10);
    expect(server.closeIdleConnections).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    await result;

    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(dependencies.logger.warn).toHaveBeenCalledWith(expect.stringContaining("final time limit"));
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  test("an unexpected cleanup failure closes the database once and exits one", async () => {
    const server = { close: vi.fn((callback) => callback()) };
    const dependencies = createDependencies({
      stopServices: vi.fn().mockRejectedValue(new Error("unexpected failure")),
    });
    const shutdown = createShutdownHandler({ server, ...dependencies });

    await shutdown("SIGINT");

    expect(dependencies.logger.error).toHaveBeenCalledWith("Shutdown service cleanup failed.");
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(1);
  });
});
