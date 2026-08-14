import {
  CodeLocationData,
  InvalidWordNameError,
  UnterminatedStringError,
} from "./errors.js";

export enum TokenType {
  STRING = 1,
  COMMENT,
  START_ARRAY,
  END_ARRAY,
  START_MODULE,
  END_MODULE,
  START_DEF,
  END_DEF,
  START_MEMO,
  WORD,
  DOT_SYMBOL,
  EOS,
}

export class CodeLocation {
  source?: string;
  line: number;
  column: number;
  start_pos: number;
  end_pos: number;

  constructor({
    source,
    line = 1,
    column = 1,
    start_pos = 0,
    end_pos = 0,
  }: Partial<CodeLocationData> = {}) {
    this.source = source;
    this.line = line;
    this.column = column;
    this.start_pos = start_pos;
    this.end_pos = end_pos;
  }
}

export class Token {
  type: TokenType;
  string: string;
  location: CodeLocation;
  // True only for a marked redirect string (`<<'''…'''`); the interpreter routes
  // these into a StringRedirectSink instead of pushing them. Ordinary strings leave it false.
  is_string_redirect: boolean;
  // Raw `input_pos` immediately after this token was gathered (0-based index into
  // `input_string`, no reference offset). Set by `next_token()`. Definition source
  // capture reads this instead of the tokenizer's live `input_pos`, so it stays
  // correct when a caller (streamingRun) tokenizes a whole chunk before executing.
  end_input_pos: number;

  constructor(
    type: TokenType,
    string: string,
    location: CodeLocation,
    is_string_redirect: boolean = false,
  ) {
    this.type = type;
    this.string = string;
    this.location = location;
    this.is_string_redirect = is_string_redirect;
    this.end_input_pos = 0;
  }
}

export class PositionedString {
  string: string;
  location: CodeLocation;

  constructor(string: string, location: CodeLocation) {
    this.string = string;
    this.location = location;
  }

  valueOf(): string {
    return this.string;
  }
}

/**
 * Escape sequences interpreted inside every string literal, at every delimiter
 * width. Only the `r` prefix (`r'…'`, `r'''…'''`) turns escaping off.
 *
 * Deliberately a whitelist: anything else after a backslash (`\d`, `\w`, `\U`)
 * stays as the literal pair, which is what keeps regex patterns and
 * Windows-style paths writable without doubling every backslash.
 */
const ESCAPE_MAP: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

export class Tokenizer {
  reference_location: CodeLocation;
  line: number;
  column: number;
  input_string: string;
  input_pos: number;
  whitespace: string[];
  quote_chars: string[];
  token_start_pos: number;
  token_end_pos: number;
  token_line: number;
  token_column: number;
  token_string: string;
  // True while the most recently gathered string is a marked redirect string
  // (`<<'''…'''`). Read after tokenizing to tell whether a trailing *open* string
  // should redirect. Reset at the start of every `next_token()`.
  string_redirect_open: boolean;
  // Delimiter of the triple-quoted string currently being gathered, or null when
  // none is open. Set while gathering and cleared when the string closes, so
  // get_string_value() can hold back a trailing run of not-yet-decided characters
  // — closing quotes and pending escapes — from an open (streaming) string.
  // Reset at the start of every `next_token()`.
  private open_triple_quote_delim: string | null;
  private streaming: boolean;

  constructor(
    string: string,
    reference_location: CodeLocation | null = null,
    streaming: boolean = false,
  ) {
    if (!reference_location) {
      reference_location = new CodeLocation(); // No default source
    }
    this.reference_location = reference_location;
    this.line = reference_location.line;
    this.column = reference_location.column;
    this.input_string = this.unescape_string(string);
    this.input_pos = 0;
    this.whitespace = [" ", "\t", "\n", "\r", "(", ")", ","];
    this.quote_chars = ['"', "'"];

    // Token info
    this.token_start_pos = 0;
    this.token_end_pos = 0;
    this.token_line = 0;
    this.token_column = 0;
    this.token_string = "";
    this.string_redirect_open = false;
    this.open_triple_quote_delim = null;
    this.streaming = streaming;
  }

  next_token(): Token {
    this.clear_token_string();
    // Each token starts unmarked; the marked-string gather sets this true. For an
    // open trailing string the gather returns null and next_token is not called
    // again, so the flag stays true exactly when is_string_redirect() is read.
    this.string_redirect_open = false;
    this.open_triple_quote_delim = null;
    const token = this.transition_from_START();
    // Stamp the post-token cursor while it is still fresh. In the non-streaming
    // path this equals the live `input_pos` a handler would read immediately
    // after next_token() returns; in the streaming path (which tokenizes the
    // whole chunk up front) it's the only correct source. An incomplete trailing
    // token returns null and is not stamped.
    if (token) token.end_input_pos = this.input_pos;
    return token;
  }

  // ===================
  // Helper functions

  unescape_string(string: string): string {
    let result = string.replace(/&lt;/g, "<");
    result = result.replace(/&gt;/g, ">");
    return result;
  }

  clear_token_string(): void {
    this.token_string = "";
  }

  note_start_token(): void {
    this.token_start_pos = this.input_pos + this.reference_location.start_pos;
    this.token_line = this.line;
    this.token_column = this.column;
  }

  is_whitespace(char: string): boolean {
    return this.whitespace.indexOf(char) >= 0;
  }

  is_quote(char: string): boolean {
    return this.quote_chars.indexOf(char) >= 0;
  }

  is_triple_quote(index: number, char: string): boolean {
    if (!this.is_quote(char)) return false;
    if (index + 2 >= this.input_string.length) return false;
    return (
      this.input_string[index + 1] === char &&
      this.input_string[index + 2] === char
    );
  }

  is_start_memo(index: number): boolean {
    if (index + 1 >= this.input_string.length) return false;
    return (
      this.input_string[index] === "@" && this.input_string[index + 1] === ":"
    );
  }

  // A marked redirect string opens with `<<` glued to a triple quote: `<<'''…`
  // or `<<"""…`. `index` points at the second `<` (the first was already
  // consumed by transition_from_START). The rule is intentionally narrow so the
  // `<` comparison word and words like `<REC!` are never affected.
  is_string_redirect_start(index: number): boolean {
    if (this.input_string[index] !== "<") return false;
    return this.is_triple_quote(index + 1, this.input_string[index + 1]);
  }

  // A raw string literal opens with `r` glued to a quote: `r'…`, `r"…`, `r'''…`
  // or `r"""…`. `index` points at the quote; the `r` was consumed by
  // transition_from_START, so only a token-initial `r` counts — `WORDr'x'` stays
  // one word. A narrow break, not a pure addition: words don't split on quotes,
  // so `r'don't'` used to lex as a single WORD.
  is_raw_string_start(index: number): boolean {
    return this.is_quote(this.input_string[index]);
  }

  advance_position(num_chars: number): number {
    let i: number;
    if (num_chars >= 0) {
      for (i = 0; i < num_chars; i++) {
        if (this.input_string[this.input_pos] === "\n") {
          this.line += 1;
          this.column = 1;
        } else {
          this.column += 1;
        }
        this.input_pos += 1;
      }
    } else {
      for (i = 0; i < -num_chars; i++) {
        this.input_pos -= 1;
        if (this.input_pos < 0 || this.column < 0) {
          throw new Error("InvalidInputPositionError");
        }
        if (this.input_string[this.input_pos] === "\n") {
          this.line -= 1;
          this.column = 1;
        } else {
          this.column -= 1;
        }
      }
      i = -i;
    }
    return i;
  }

  get_token_location(): CodeLocation {
    return new CodeLocation({
      source: this.reference_location.source,
      line: this.token_line,
      column: this.token_column,
      start_pos: this.token_start_pos,
      end_pos: this.token_start_pos + this.token_string.length,
    });
  }

  get_input_string(): string {
    return this.input_string;
  }

  /**
   * Canonical content of the string token currently being gathered, accumulated
   * so far, with escape sequences already processed — so for an open regular
   * string it equals the prefix of the value the completed STRING token will
   * carry. This is what a redirect string streams into its sink. Empty when no
   * string is open.
   *
   * For an *open* triple-quoted string, a trailing run of characters whose
   * identity is not yet decided is held back, so a length-diffing consumer never
   * receives a byte the finished string will not contain. Two kinds qualify:
   *
   *   - the delimiter char, which may yet begin the closing `'''`/`"""` (or be
   *     greedy content) rather than being content outright;
   *   - a backslash, which may yet begin an escape once the next chunk arrives.
   *     `abc\` re-tokenizes as `abc` + a newline when `\n` completes, so
   *     reporting the backslash would make the cumulative value shrink.
   *
   * One loop rather than two passes: `\'` now yields a real quote, so a value can
   * end `…\` + `'`, and stripping the quote exposes a backslash that must also be
   * held. Held-back characters are not tracked or replayed — the caller re-feeds
   * the full cumulative content each chunk, so they are picked up naturally, and
   * `finish()` feeds the completed token string. That makes the holdback lossless
   * for *completed* literals; a `done=true` unterminated string throws before this
   * is consulted, and the held bytes die with the erroring turn.
   *
   * Deliberately conservative: a trailing backslash that turns out to be settled
   * (a resolved `\\`) is indistinguishable from a pending one, so both are held
   * and the settled one is simply reported one chunk later.
   */
  get_string_value(): string {
    if (this.open_triple_quote_delim === null) return this.token_string;
    let end = this.token_string.length;
    while (
      end > 0 &&
      (this.token_string[end - 1] === this.open_triple_quote_delim ||
        this.token_string[end - 1] === "\\")
    ) {
      end--;
    }
    return this.token_string.slice(0, end);
  }

  /**
   * True when the string currently being gathered is a marked redirect string
   * (`<<'''…'''`). Used by streamingRun to decide whether a trailing *open* string
   * should be fed to a StringRedirectSink. False for ordinary strings and when none is open.
   */
  is_string_redirect(): boolean {
    return this.string_redirect_open;
  }

  transition_from_START(): Token {
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.note_start_token();
      this.advance_position(1);

      if (this.is_whitespace(char)) continue;
      else if (char === "#") return this.transition_from_COMMENT();
      else if (char === ":") return this.transition_from_START_DEFINITION();
      else if (this.is_start_memo(this.input_pos - 1)) {
        this.advance_position(1); // Skip over ":" in "@:"
        return this.transition_from_START_MEMO();
      } else if (char === ";") {
        this.token_string = char;
        return new Token(TokenType.END_DEF, char, this.get_token_location());
      } else if (char === "[") {
        this.token_string = char;
        return new Token(
          TokenType.START_ARRAY,
          char,
          this.get_token_location(),
        );
      } else if (char === "]") {
        this.token_string = char;
        return new Token(TokenType.END_ARRAY, char, this.get_token_location());
      } else if (char === "{") return this.transition_from_GATHER_MODULE();
      else if (char === "}") {
        this.token_string = char;
        return new Token(TokenType.END_MODULE, char, this.get_token_location());
      } else if (
        char === "<" &&
        this.is_string_redirect_start(this.input_pos)
      ) {
        // Marked redirect string `<<'''…` / `<<"""…`. The first `<` is `char`;
        // skip the second `<` plus the three opening quotes, then gather with
        // the same escape processing every triple-quoted literal gets. There is
        // no `<<r'''` form, so a redirect literal is always escape-processing;
        // content that must carry a literal backslash has to double it.
        const quote = this.input_string[this.input_pos + 1];
        this.advance_position(4);
        return this.transition_from_GATHER_TRIPLE_QUOTE_STRING(quote, true, false);
      } else if (char === "r" && this.is_raw_string_start(this.input_pos)) {
        // Raw string `r'…'` / `r"…"` / `r'''…'''` / `r"""…"""`. The `r` is
        // `char`, so input_pos already sits on the opening quote; skip the
        // delimiter and gather with escape processing off.
        const quote = this.input_string[this.input_pos];
        if (this.is_triple_quote(this.input_pos, quote)) {
          this.advance_position(3);
          // At triple width `r` is the only raw spelling: the bare form
          // interprets the whitelist, so this is what 0.16.2 shipped for.
          return this.transition_from_GATHER_TRIPLE_QUOTE_STRING(quote, false, true);
        }
        this.advance_position(1);
        return this.transition_from_GATHER_STRING(quote, true);
      } else if (this.is_triple_quote(this.input_pos - 1, char)) {
        this.advance_position(2); // Skip over 2nd and 3rd quote chars
        return this.transition_from_GATHER_TRIPLE_QUOTE_STRING(char);
      } else if (this.is_quote(char))
        return this.transition_from_GATHER_STRING(char);
      else if (char === ".") {
        this.advance_position(-1); // Back up to beginning of dot symbol
        return this.transition_from_GATHER_DOT_SYMBOL();
      } else {
        this.advance_position(-1); // Back up to beginning of word
        return this.transition_from_GATHER_WORD();
      }
    }
    return new Token(TokenType.EOS, "", this.get_token_location());
  }

  transition_from_COMMENT(): Token {
    this.note_start_token();
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.token_string += char;
      this.advance_position(1);
      if (char === "\n") {
        this.advance_position(-1);
        break;
      }
    }
    return new Token(
      TokenType.COMMENT,
      this.token_string,
      this.get_token_location(),
    );
  }

  transition_from_START_DEFINITION(): Token {
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);

      if (this.is_whitespace(char)) continue;
      else if (this.is_quote(char)) {
        throw new InvalidWordNameError(
          this.input_string,
          this.get_token_location(),
          "Definition names can't have quotes in them",
        );
      } else {
        this.advance_position(-1);
        return this.transition_from_GATHER_DEFINITION_NAME();
      }
    }

    // Streaming: a chunk boundary landed right after `:` (no name yet). Hold the
    // token back — the same way an unterminated string does — so the caller
    // re-tokenizes it once more content arrives, instead of throwing on a
    // syntactically fine definition whose name simply hasn't streamed in yet.
    if (this.streaming) {
      return null as any;
    }
    throw new InvalidWordNameError(
      this.input_string,
      this.get_token_location(),
      "Got EOS in START_DEFINITION",
    );
  }

  transition_from_START_MEMO(): Token {
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);

      if (this.is_whitespace(char)) continue;
      else if (this.is_quote(char))
        throw new InvalidWordNameError(
          this.input_string,
          this.get_token_location(),
          "Memo names can't have quotes in them",
        );
      else {
        this.advance_position(-1);
        return this.transition_from_GATHER_MEMO_NAME();
      }
    }

    // Streaming: a chunk boundary landed right after `@:` (no name yet). Hold the
    // token back so the caller re-tokenizes it once more content arrives, rather
    // than throwing on a memo definition whose name hasn't streamed in yet.
    if (this.streaming) {
      return null as any;
    }
    throw new InvalidWordNameError(
      this.input_string,
      this.get_token_location(),
      "Got EOS in START_MEMO",
    );
  }

  gather_definition_name(): void {
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);
      if (this.is_whitespace(char)) break;
      if (this.is_quote(char)) {
        throw new InvalidWordNameError(
          this.input_string,
          this.get_token_location(),
          "Definition names can't have quotes in them",
        );
      }
      if (["[", "]", "{", "}"].indexOf(char) >= 0) {
        throw new InvalidWordNameError(
          this.input_string,
          this.get_token_location(),
          `Definition names can't have '${char}' in them`,
        );
      }
      this.token_string += char;
    }
  }

  transition_from_GATHER_DEFINITION_NAME(): Token {
    this.note_start_token();
    this.gather_definition_name();
    return new Token(
      TokenType.START_DEF,
      this.token_string,
      this.get_token_location(),
    );
  }

  transition_from_GATHER_MEMO_NAME(): Token {
    this.note_start_token();
    this.gather_definition_name();
    return new Token(
      TokenType.START_MEMO,
      this.token_string,
      this.get_token_location(),
    );
  }

  transition_from_GATHER_MODULE(): Token {
    this.note_start_token();
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);
      if (this.is_whitespace(char)) break;
      else if (char === "}") {
        this.advance_position(-1);
        break;
      } else this.token_string += char;
    }
    return new Token(
      TokenType.START_MODULE,
      this.token_string,
      this.get_token_location(),
    );
  }

  transition_from_GATHER_TRIPLE_QUOTE_STRING(
    delim: string,
    is_string_redirect: boolean = false,
    raw: boolean = false,
  ): Token {
    this.note_start_token();
    const string_delimiter = delim;
    // Records whether this string is a marked redirect string so is_string_redirect()
    // reports correctly while it is still open (the streaming `return null` path).
    this.string_redirect_open = is_string_redirect;
    // Mark this triple string as open with its delimiter so get_string_value() can
    // hold back an unconfirmed trailing run — closing quotes, and a backslash that
    // may yet begin an escape — while it is still gathering.
    // Cleared on the normal close path below; left set on the streaming `return null`.
    this.open_triple_quote_delim = string_delimiter;

    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];

      // Escapes resolve before delimiter detection, so an escaped quote is
      // content and can never close the literal. Unlike GATHER_STRING this loop
      // does not pre-advance, so input_pos still points at `char`.
      if (!raw && char === "\\" && this.input_pos + 1 < this.input_string.length) {
        const next_char = this.input_string[this.input_pos + 1];
        if (Object.prototype.hasOwnProperty.call(ESCAPE_MAP, next_char)) {
          this.advance_position(2);
          this.token_string += ESCAPE_MAP[next_char];
          continue;
        }
        // Not a recognised escape: the backslash is ordinary content, which is
        // what keeps `\d`, `\w` and `C:\Users` writable.
        this.advance_position(1);
        this.token_string += char;
        continue;
      }

      if (
        char === string_delimiter &&
        this.is_triple_quote(this.input_pos, char)
      ) {
        // Check if this triple quote is followed by at least one more quote (greedy mode trigger)
        if (
          this.input_pos + 3 < this.input_string.length &&
          this.input_string[this.input_pos + 3] === string_delimiter
        ) {
          // Greedy mode: include this quote as content and continue looking for the end
          this.advance_position(1); // Advance by 1 to catch overlapping sequences
          this.token_string += string_delimiter;
          continue;
        }

        // Normal behavior: close at first triple quote
        this.advance_position(3);
        this.open_triple_quote_delim = null; // string closed: nothing to hold back
        return new Token(
          TokenType.STRING,
          this.token_string,
          this.get_token_location(),
          is_string_redirect,
        );
      } else {
        this.advance_position(1);
        this.token_string += char;
      }
    }

    if (this.streaming) {
      return null as any;
    }
    throw new UnterminatedStringError(
      "Unterminated string",
      this.get_token_location(),
    );
  }

  transition_from_GATHER_STRING(delim: string, raw: boolean = false): Token {
    this.note_start_token();
    const string_delimiter = delim;

    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);

      if (!raw && char === "\\" && this.input_pos < this.input_string.length) {
        const next_char = this.input_string[this.input_pos];
        if (Object.prototype.hasOwnProperty.call(ESCAPE_MAP, next_char)) {
          this.advance_position(1);
          this.token_string += ESCAPE_MAP[next_char];
          continue;
        }
        // Unrecognized escape: leave both characters literal so regex
        // patterns like '\d+' and Windows paths like 'C:\Users' keep working.
        this.token_string += char;
        continue;
      }

      if (char === string_delimiter) {
        return new Token(
          TokenType.STRING,
          this.token_string,
          this.get_token_location(),
        );
      } else {
        this.token_string += char;
      }
    }

    if (this.streaming) {
      return null as any;
    }
    throw new UnterminatedStringError(
      "Unterminated string",
      this.get_token_location(),
    );
  }

  transition_from_GATHER_WORD(): Token {
    this.note_start_token();
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);
      if (this.is_whitespace(char)) break;
      if ([";", "{", "}", "#"].indexOf(char) >= 0) {
        this.advance_position(-1);
        break;
      }
      // Handle RFC 9557 datetime with IANA timezone: 2025-05-20T08:00:00[America/Los_Angeles]
      // When we see '[', check if token looks like a datetime (contains 'T')
      // If so, include the bracketed timezone as part of the token
      if (char === "[") {
        if (this.token_string.includes("T")) {
          // This looks like a datetime, gather until ']'
          this.token_string += char;
          while (this.input_pos < this.input_string.length) {
            const tzChar = this.input_string[this.input_pos];
            this.advance_position(1);
            this.token_string += tzChar;
            if (tzChar === "]") break;
          }
          break;
        } else {
          // Not a datetime, treat '[' as delimiter
          this.advance_position(-1);
          break;
        }
      }
      if (char === "]") {
        this.advance_position(-1);
        break;
      }
      this.token_string += char;
    }
    return new Token(
      TokenType.WORD,
      this.token_string,
      this.get_token_location(),
    );
  }

  transition_from_GATHER_DOT_SYMBOL(): Token {
    this.note_start_token();
    let full_token_string = "";
    while (this.input_pos < this.input_string.length) {
      const char = this.input_string[this.input_pos];
      this.advance_position(1);
      if (this.is_whitespace(char)) break;
      if ([";", "[", "]", "{", "}", "#"].indexOf(char) >= 0) {
        this.advance_position(-1);
        break;
      } else {
        full_token_string += char;
        this.token_string += char;
      }
    }

    // If dot symbol has no characters after the dot, treat it as a word
    if (full_token_string.length < 2) {
      // "." + at least 1 char = 2 minimum
      return new Token(
        TokenType.WORD,
        full_token_string,
        this.get_token_location(),
      );
    }

    // For DOT_SYMBOL, return the string without the dot prefix
    const symbol_without_dot = full_token_string.substring(1);
    return new Token(
      TokenType.DOT_SYMBOL,
      symbol_without_dot,
      this.get_token_location(),
    );
  }
}

export { InvalidWordNameError, UnterminatedStringError };
