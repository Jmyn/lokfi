import { StatementParser } from './types'

export class ParserRegistry {
  private parsers: StatementParser[] = []
  private fallbackParser: StatementParser | null = null

  register(parser: StatementParser): void {
    this.parsers.push(parser)
  }

  registerFallback(parser: StatementParser): void {
    this.fallbackParser = parser
  }

  /**
   * Scans all registered parsers and returns the first one that can parse the text.
   * Uses the fast `detect(text)` heuristic.
   * If no parser matches, returns the fallback parser if registered.
   * @param text The raw statement text
   * @returns The matching parser, or null if no parser matches.
   */
  getParser(text: string): StatementParser | null {
    for (const parser of this.parsers) {
      if (parser.detect(text)) {
        return parser
      }
    }
    return this.fallbackParser
  }
}
