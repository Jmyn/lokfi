import { StatementParser } from './types'

export class ParserRegistry {
  private parsers: StatementParser[] = []

  register(parser: StatementParser): void {
    this.parsers.push(parser)
  }

  /**
   * Scans all registered parsers and returns the first one that can parse the text.
   * Uses the fast `detect(text)` heuristic.
   * @param text The raw statement text
   * @returns The matching parser, or null if no parser matches.
   */
  getParser(text: string): StatementParser | null {
    for (const parser of this.parsers) {
      if (parser.detect(text)) {
        return parser
      }
    }
    return null
  }
}
