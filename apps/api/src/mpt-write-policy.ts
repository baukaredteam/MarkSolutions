// W0-03a — capability guard for IS-MPT business writes.
//
// MPT_WRITE_ENABLED defaults to false and must stay false in every committed
// artifact (code, tests, local config). The policy is a single seam asserted
// by (a) HttpMptAdapter before constructing any request / network I/O, and
// (b) controllers/command handlers before queuing an operation.
// Authentication/refresh POST is transport, not a business write.

export type MptWriteOperation =
  "createOrder" | "submitUtilisation" | "submitImport" | "submitWithdrawal";

export class WriteDisabledError extends Error {
  readonly operation: MptWriteOperation;
  constructor(operation: MptWriteOperation) {
    super(
      `MPT business write disabled (MPT_WRITE_ENABLED=false): ${operation}`
    );
    this.name = "WriteDisabledError";
    this.operation = operation;
  }
}

export interface MptWritePolicy {
  /** @throws WriteDisabledError when MPT_WRITE_ENABLED is not exactly "true". */
  assertAllowed(operation: MptWriteOperation): void;
}

export function createMptWritePolicy(config: {
  mptWriteEnabled: boolean;
}): MptWritePolicy {
  const enabled = config.mptWriteEnabled === true;
  return {
    assertAllowed(operation: MptWriteOperation): void {
      if (!enabled) throw new WriteDisabledError(operation);
    },
  };
}

export const MPT_WRITE_POLICY = "MPT_WRITE_POLICY";
