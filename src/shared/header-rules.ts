/**
 * The rules a response header name and value must satisfy.
 *
 * Lives in `shared/` because both halves need the same answer. The backend is
 * still what guards storage — `compiled_headers` serves stored output without
 * re-validating it — but a customer choosing their own header name needs the
 * console to apply the same rules as they type, or the console would happily
 * build a header that the save then rejects.
 */

/**
 * Header names must be a valid HTTP field-name (RFC 9110 token). Rejecting
 * anything else matters: a name containing CR, LF or a colon could otherwise be
 * used to inject additional headers when the head applies them.
 */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Header values must not contain control characters, for the same
 * response-splitting reason. Written with escapes rather than the literal bytes,
 * which are invisible in a source file.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * What a header name may contain, in words. Shared so the console's inline
 * message and the backend's rejection describe the same rule.
 */
export const HEADER_NAME_RULE = "Only letters, digits and !#$%&'*+-.^_`|~ are allowed.";

export function isValidHeaderName(headerName: string): boolean {
  return HEADER_NAME_PATTERN.test(headerName);
}

export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHARACTERS.test(value);
}
