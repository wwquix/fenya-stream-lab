import { randomUUID } from "node:crypto";

import {
  completeImportJob,
  createImportJob,
  getImportErrors,
  getImportJob,
  saveImportedEvent,
  saveImportError,
} from "../repositories/importRepository.js";
import { validateStreamEvent } from "../validation/streamEventSchema.js";

export function importStreamEvents({ format, records, sourceName }) {
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  createImportJob({ jobId, format, sourceName, totalCount: records.length, createdAt });

  let successCount = 0;
  let rejectedCount = 0;
  let streamId = null;

  for (const record of records) {
    const validation = validateStreamEvent(record.payload);

    if (!validation.success) {
      rejectedCount += 1;
      saveImportError({
        jobId,
        rowNumber: record.rowNumber,
        eventType: record.payload?.type,
        message: validation.message,
        payload: record.payload,
      });
      continue;
    }

    try {
      saveImportedEvent(validation.data, `import:${format}`);
      successCount += 1;
      streamId ??= validation.data.streamId;
    } catch (error) {
      rejectedCount += 1;
      saveImportError({
        jobId,
        rowNumber: record.rowNumber,
        eventType: validation.data.type,
        message: error.code === "SQLITE_CONSTRAINT_UNIQUE"
          ? `Duplicate eventId: ${validation.data.eventId}`
          : `Database write failed: ${error.message}`,
        payload: record.payload,
      });
    }
  }

  completeImportJob({
    jobId,
    status: rejectedCount === 0 ? "completed" : successCount > 0 ? "completed_with_errors" : "failed",
    streamId,
    successCount,
    rejectedCount,
    completedAt: new Date().toISOString(),
  });

  return getImportJob(jobId);
}

export function getImportJobWithErrors(jobId) {
  const job = getImportJob(jobId);
  return job ? { ...job, errors: getImportErrors(jobId) } : null;
}

export { getImportErrors, getImportJob };
