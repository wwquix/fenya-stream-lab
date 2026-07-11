const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;
const DEFAULT_HTTP_IDLE_GRACE_MS = 1_000;
const DEFAULT_HTTP_FORCE_GRACE_MS = 250;

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function waitForOperation(operation, timeoutMs) {
  if (timeoutMs === 0) return Promise.resolve({ status: "timeout" });

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve({ status: "fulfilled", value });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ status: "rejected", error });
      },
    );
  });
}

function waitForDeadline(operation, deadline) {
  return waitForOperation(operation, remainingMs(deadline));
}

function beginHttpClose(server) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    try {
      server.close(finish);
    } catch (error) {
      finish(error);
    }
  });
}

async function closeHttpServer(server, { deadline, idleGraceMs, forceGraceMs, logger }) {
  const closeOperation = beginHttpClose(server);
  void closeOperation.catch(() => undefined);
  let cleanupFailed = false;
  let result = await waitForOperation(closeOperation, Math.min(idleGraceMs, remainingMs(deadline)));

  if (result.status === "timeout" && typeof server.closeIdleConnections === "function") {
    logger.warn("HTTP shutdown is waiting on active connections; closing idle connections.");
    try { server.closeIdleConnections(); } catch { cleanupFailed = true; }
  }

  const forceWaitMs = Math.max(0, remainingMs(deadline) - forceGraceMs);
  if (result.status === "timeout" && forceWaitMs > 0) {
    result = await waitForOperation(closeOperation, forceWaitMs);
  }

  if (result.status === "timeout") {
    logger.warn("HTTP shutdown reached its final time limit; closing remaining connections.");
    if (typeof server.closeAllConnections === "function") {
      try { server.closeAllConnections(); } catch { cleanupFailed = true; }
    }
    result = await waitForOperation(closeOperation, Math.min(forceGraceMs, remainingMs(deadline)));
  }

  return { ...result, cleanupFailed };
}

export function createApplicationStopServices({
  stopReplays,
  shutdownMockSampler,
  shutdownTokenRefresh,
  shutdownIngest,
}) {
  const cleanupSteps = [stopReplays, shutdownMockSampler, shutdownTokenRefresh, shutdownIngest];
  return async function stopApplicationServices() {
    const results = await Promise.allSettled(cleanupSteps.map((cleanup) => Promise.resolve().then(cleanup)));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("One or more application services failed to stop");
    }
  };
}

export function createShutdownHandler({
  server,
  stopServices,
  closeDatabase,
  exit,
  logger = console,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  httpIdleGraceMs = DEFAULT_HTTP_IDLE_GRACE_MS,
  httpForceGraceMs = DEFAULT_HTTP_FORCE_GRACE_MS,
}) {
  let shutdownPromise = null;

  return function shutdown(signal = "shutdown") {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const deadline = Date.now() + timeoutMs;
      let failed = false;
      logger.log(`Received ${signal}; shutting down Fenya Stream Lab backend.`);

      const httpClose = closeHttpServer(server, {
        deadline,
        idleGraceMs: httpIdleGraceMs,
        forceGraceMs: httpForceGraceMs,
        logger,
      });
      const servicesResult = await waitForDeadline(Promise.resolve().then(stopServices), deadline);
      if (servicesResult.status === "rejected") {
        failed = true;
        logger.error("Shutdown service cleanup failed.");
      } else if (servicesResult.status === "timeout") {
        logger.warn("Shutdown service cleanup reached its time limit.");
      }

      const httpResult = await httpClose;
      if (httpResult.cleanupFailed) {
        failed = true;
        logger.error("Forced HTTP connection cleanup failed.");
      }
      if (httpResult.status === "rejected") {
        failed = true;
        logger.error("HTTP server shutdown failed.");
      }

      try {
        closeDatabase();
      } catch {
        failed = true;
        logger.error("Database shutdown failed.");
      }

      const exitCode = failed ? 1 : 0;
      logger.log(exitCode === 0 ? "Fenya Stream Lab backend stopped cleanly." : "Fenya Stream Lab backend shutdown failed.");
      exit(exitCode);
      return exitCode;
    })();

    return shutdownPromise;
  };
}
