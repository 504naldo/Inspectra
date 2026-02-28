/**
 * Base HTTP error class with status code.
 * Throw this from route handlers to send specific HTTP errors.
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// Convenience constructors
export const BadRequestError = (msg: string) => new HttpError(400, msg);
export const UnauthorizedError = (msg: string) => new HttpError(401, msg);
export const ForbiddenError = (msg: string) => new HttpError(403, msg);
export const NotFoundError = (msg: string) => new HttpError(404, msg);

// ============================================================
// Compliance Hardening Error Codes
// ============================================================

/**
 * Thrown when a mutation targets a finalized job.
 * The job's finalizedAt is set and the record is immutable.
 */
export const JOB_FINALIZED_IMMUTABLE = "JOB_FINALIZED_IMMUTABLE";

/**
 * Thrown when the stored finalization hash does not match the recomputed hash.
 * Indicates possible data tampering or corruption.
 */
export const FINALIZATION_HASH_MISMATCH = "FINALIZATION_HASH_MISMATCH";

/**
 * Thrown when a finalize request is missing clientAssertsSynced: true.
 */
export const SYNC_ASSERTION_REQUIRED = "SYNC_ASSERTION_REQUIRED";

/**
 * Thrown when attempting to finalize a cancelled job.
 */
export const JOB_CANCELLED_CANNOT_FINALIZE = "JOB_CANCELLED_CANNOT_FINALIZE";

/**
 * Thrown when attempting to finalize a job that is not in_progress.
 * (status is pending or scheduled)
 */
export const JOB_NOT_IN_PROGRESS = "JOB_NOT_IN_PROGRESS";

/**
 * Thrown when attempting to finalize a job that is already finalized (status = completed).
 */
export const JOB_ALREADY_FINALIZED = "JOB_ALREADY_FINALIZED";

/**
 * Payload type for FINALIZATION_HASH_MISMATCH errors.
 */
export type FinalizationHashMismatchPayload = {
  jobId: number;
  storedHash: string;
  recomputedHash: string;
  detectedAt: string; // ISO timestamp
  message: string;
};
