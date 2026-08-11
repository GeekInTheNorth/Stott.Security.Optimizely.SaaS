/**
 * A single CSP directive and its sources, carrying the predicted byte cost used
 * by the optimiser's bin-packing.
 *
 * Ported from Features/Csp/Dtos/CspDirectiveDto.cs.
 */

export interface CspDirective {
  readonly directive: string;
  readonly sources: readonly string[];
  /**
   * Predicted serialised length: `directive.length + 3 + Σ(source.length + 1)`.
   *
   * The +3 covers the trailing `; ` separator plus the space after the directive
   * name; the +1 per source covers the space between sources. Kept identical to
   * the C# original because the split thresholds are tuned against it and the
   * ported tests assert on exact source counts.
   */
  readonly predictedSize: number;
}

/**
 * Blank sources are dropped, matching `IsNullOrWhiteSpace` filtering in the C#
 * constructor, so they cannot inflate the predicted size.
 */
export function createDirective(
  directive: string,
  sources: readonly string[] | string
): CspDirective {
  const candidates = typeof sources === 'string' ? [sources] : sources;
  const cleaned = candidates.filter((s) => s.trim().length > 0);

  return {
    directive,
    sources: cleaned,
    predictedSize:
      directive.length + 3 + cleaned.reduce((total, s) => total + s.length + 1, 0)
  };
}

/** Serialised form, matching `CspDirectiveDto.ToString()`. */
export function directiveToString(directive: CspDirective): string {
  return directive.sources.length > 0
    ? `${directive.directive} ${directive.sources.join(' ')}; `
    : `${directive.directive}; `;
}
