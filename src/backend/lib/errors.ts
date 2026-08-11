/* eslint-disable max-classes-per-file --
 * The one-class-per-file rule exists to stop god-files accumulating unrelated
 * responsibilities. A closed set of small error types that callers discriminate
 * on with `instanceof` is the opposite: they are meaningless apart, and splitting
 * them across five files would obscure the set rather than clarify it.
 */

/**
 * Errors the backend functions discriminate on to choose an HTTP status.
 *
 * Kept separate from the modules that throw them so both `storage.ts` and the
 * functions can import without a cycle.
 */

/** A second editor saved while this one was working. Maps to HTTP 409. */
export class StaleRevisionError extends Error {
  public constructor(
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(`Draft was modified by someone else (expected revision ${expected}, found ${actual}).`);
    this.name = 'StaleRevisionError';
  }
}

/** Configuration exceeds the storage limit. Maps to HTTP 413. */
export class DocumentTooLargeError extends Error {
  public constructor(
    public readonly bytes: number,
    public readonly limit: number
  ) {
    super(`Configuration is ${bytes} bytes, over the ${limit} byte limit.`);
    this.name = 'DocumentTooLargeError';
  }
}

/**
 * A stored document could not be parsed. Maps to HTTP 500 — this is corruption
 * or a schema change, not user error, so it must be logged rather than shown as
 * a validation message.
 */
export class CorruptDocumentError extends Error {
  public constructor(
    public readonly key: string,
    cause: unknown
  ) {
    super(`Stored document at '${key}' could not be parsed: ${String(cause)}`);
    this.name = 'CorruptDocumentError';
  }
}

/** The request body was missing or failed validation. Maps to HTTP 400. */
export class InvalidPayloadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidPayloadError';
  }
}
