import {
  Tokenizer,
  CodeLocation,
  InvalidWordNameError,
  UnterminatedStringError,
  TokenType,
} from "../../../tokenizer";

test("Knows token positions", () => {
  const main_forthic = `
    : ADD-ONE   1 23 +;
    {module
        # 2 ADD-ONE
    }
    @: MY-MEMO   [ "hello" '''triple-single-quoted-string'''];
    `;

  const reference_location = new CodeLocation({
    source: "main",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  const tokenizer = new Tokenizer(main_forthic, reference_location);

  // TOK_START_DEF
  const begin_def = tokenizer.next_token();
  expect(begin_def.location).toEqual({
    line: 2,
    column: 7,
    source: "main",
    start_pos: 7,
    end_pos: 14,
  });

  // TOK_WORD: 1
  const one_token = tokenizer.next_token();
  expect(one_token.location).toEqual({
    line: 2,
    column: 17,
    source: "main",
    start_pos: 17,
    end_pos: 18,
  });

  // TOK_WORD: 23
  const token_23 = tokenizer.next_token();
  expect(token_23.location).toEqual({
    line: 2,
    column: 19,
    source: "main",
    start_pos: 19,
    end_pos: 21,
  });

  // TOK_WORD: +
  const plus_token = tokenizer.next_token();
  expect(plus_token.location).toEqual({
    line: 2,
    column: 22,
    source: "main",
    start_pos: 22,
    end_pos: 23,
  });

  // TOK_END_DEF
  const end_def_token = tokenizer.next_token();
  expect(end_def_token.location).toEqual({
    line: 2,
    column: 23,
    source: "main",
    start_pos: 23,
    end_pos: 24,
  });

  // TOK_START_MODULE
  const module_start_token = tokenizer.next_token();
  expect(module_start_token.location).toEqual({
    line: 3,
    column: 6,
    source: "main",
    start_pos: 30,
    end_pos: 36,
  });

  // TOK_COMMENT
  const comment_token = tokenizer.next_token();
  expect(comment_token.location).toEqual({
    line: 4,
    column: 10,
    source: "main",
    start_pos: 46,
    end_pos: 57,
  });

  // TOK_END_MODULE
  const end_module_token = tokenizer.next_token();
  expect(end_module_token.location).toEqual({
    line: 5,
    column: 5,
    source: "main",
    start_pos: 61,
    end_pos: 62,
  });

  // TOK_START_MEMO
  const start_memo_token = tokenizer.next_token();
  expect(start_memo_token.location).toEqual({
    line: 6,
    column: 8,
    source: "main",
    start_pos: 70,
    end_pos: 77,
  });

  // TOK_START_ARRAY
  const start_array_token = tokenizer.next_token();
  expect(start_array_token.location).toEqual({
    line: 6,
    column: 18,
    source: "main",
    start_pos: 80,
    end_pos: 81,
  });

  // TOK_STRING
  const start_string_token = tokenizer.next_token();
  expect(start_string_token.location).toEqual({
    line: 6,
    column: 21,
    source: "main",
    start_pos: 83,
    end_pos: 88,
  });

  // TOK_STRING
  const start_triple_string_token = tokenizer.next_token();
  expect(start_triple_string_token.location).toEqual({
    line: 6,
    column: 31,
    source: "main",
    start_pos: 93,
    end_pos: 120,
  });

  // TOK_END_ARRAY,
  const end_array_token = tokenizer.next_token();
  expect(end_array_token.location).toEqual({
    line: 6,
    column: 61,
    source: "main",
    start_pos: 123,
    end_pos: 124,
  });
});

test("Knows token location in ad hoc string given reference", () => {
  const reference_location = new CodeLocation({
    source: "main",
    line: 21,
    column: 15,
    start_pos: 67,
  });

  const main_forthic = "'key' REC@ LOWERCASE";

  const tokenizer = new Tokenizer(main_forthic, reference_location);
  let token;

  // 'key'
  token = tokenizer.next_token();
  expect(token.string).toEqual("key");
  expect(token.location).toEqual({
    line: 21,
    column: 16,
    source: "main",
    start_pos: 68,
    end_pos: 71,
  });

  // REC@
  token = tokenizer.next_token();
  expect(token.string).toEqual("REC@");
  expect(token.location).toEqual({
    line: 21,
    column: 21,
    source: "main",
    start_pos: 73,
    end_pos: 77,
  });

  // LOWERCASE
  token = tokenizer.next_token();
  expect(token.string).toEqual("LOWERCASE");
  expect(token.location).toEqual({
    line: 21,
    column: 26,
    source: "main",
    start_pos: 78,
    end_pos: 87,
  });
});

test("Invalid word name", () => {
  const reference_location = new CodeLocation({
    source: "main",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  const main_forthic = ": John's-Word   1 23 +;";

  try {
    const tokenizer = new Tokenizer(main_forthic, reference_location);
    tokenizer.next_token();
  } catch (e) {
    expect(e).toBeInstanceOf(InvalidWordNameError);
  }
});

test("Unterminated string", () => {
  const reference_location = new CodeLocation({
    source: "main",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  const main_forthic = "'key";

  try {
    const tokenizer = new Tokenizer(main_forthic, reference_location);
    tokenizer.next_token();
  } catch (e) {
    expect(e).toBeInstanceOf(UnterminatedStringError);
  }
});

describe("Triple quote string with nested quotes", () => {
  const reference_location = new CodeLocation({
    source: "test",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  test("Basic case: '''I said 'Hello''''", () => {
    const input = "'''I said 'Hello''''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual("I said 'Hello'");
  });

  test("Normal triple quote behavior (no 4+ consecutive quotes)", () => {
    const input = "'''Hello'''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual("Hello");
  });

  test("Double quotes with greedy mode", () => {
    const input = '"""I said "Hello""""';
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual('I said "Hello"');
  });

  test("Six consecutive quotes (empty string case)", () => {
    const input = "''''''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual("");
  });

  test("Eight consecutive quotes (two quote content)", () => {
    const input = "''''''''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual("''");
  });

  test("Multiple nested quotes", () => {
    const input = `"""He said "I said 'Hello' to you""""`;
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual(`He said "I said 'Hello' to you"`);
  });

  test("No greedy mode when triple quote not followed by quote", () => {
    const input = "'''Hello''' world'''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    // Should close at first ''' since it's not followed by another quote
    expect(token.string).toEqual("Hello");
  });

  test("Content with apostrophes (contractions)", () => {
    const input = "'''It's a beautiful day, isn't it?''''";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.string).toEqual("It's a beautiful day, isn't it?'");
  });

  test("Mixed quote types don't trigger greedy mode", () => {
    const input = "'''Hello\"\"\"";
    const tokenizer = new Tokenizer(input, reference_location);

    try {
      tokenizer.next_token();
    } catch (e) {
      expect(e).toBeInstanceOf(UnterminatedStringError);
    }
  });

  test("Backward compatibility: normal strings unchanged", () => {
    const inputs = [
      "'''simple'''",
      "'''multi\nline\nstring'''",
      "'''string with \"double quotes\"'''",
      "'''string with 'single quotes'''''",
    ];

    const expected = [
      "simple",
      "multi\nline\nstring",
      'string with "double quotes"',
      "string with 'single quotes''",
    ];

    inputs.forEach((input, i) => {
      const tokenizer = new Tokenizer(input, reference_location);
      const token = tokenizer.next_token();
      expect(token.string).toEqual(expected[i]);
    });
  });
});

describe("Dot symbol tokenization", () => {
  const reference_location = new CodeLocation({
    source: "test",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  test("Basic dot symbol: .symbol", () => {
    const input = ".symbol";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token.string).toEqual("symbol");
  });

  test("Dot symbol with numbers and hyphens: .symbol-123", () => {
    const input = ".symbol-123";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token.string).toEqual("symbol-123");
  });

  test("Dot symbol with underscores: .my_symbol_123", () => {
    const input = ".my_symbol_123";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token.string).toEqual("my_symbol_123");
  });

  test("Dot symbol terminated by whitespace", () => {
    const input = ".symbol NEXT";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("symbol");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.WORD);
    expect(token2.string).toEqual("NEXT");
  });

  test("Dot symbol terminated by array bracket", () => {
    const input = ".symbol]";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("symbol");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.END_ARRAY);
    expect(token2.string).toEqual("]");
  });

  test("Dot symbol terminated by semicolon", () => {
    const input = ".symbol;";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("symbol");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.END_DEF);
    expect(token2.string).toEqual(";");
  });

  test("Dot symbol in array: [.symbol1 .symbol2]", () => {
    const input = "[.symbol1 .symbol2]";
    const tokenizer = new Tokenizer(input, reference_location);

    const tokens = [];
    let token = tokenizer.next_token();
    while (token.type !== TokenType.EOS) {
      tokens.push(token);
      token = tokenizer.next_token();
    }

    expect(tokens.length).toEqual(4);
    expect(tokens[0].type).toEqual(TokenType.START_ARRAY);
    expect(tokens[1].type).toEqual(TokenType.DOT_SYMBOL);
    expect(tokens[1].string).toEqual("symbol1");
    expect(tokens[2].type).toEqual(TokenType.DOT_SYMBOL);
    expect(tokens[2].string).toEqual("symbol2");
    expect(tokens[3].type).toEqual(TokenType.END_ARRAY);
  });

  test("Dot symbol with complex characters: .test@domain.com", () => {
    const input = ".test@domain.com";
    const tokenizer = new Tokenizer(input, reference_location);
    const token = tokenizer.next_token();

    expect(token.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token.string).toEqual("test@domain.com");
  });

  test("Just a dot by itself should be treated as a word", () => {
    const input = ". NEXT";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.WORD);
    expect(token1.string).toEqual(".");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.WORD);
    expect(token2.string).toEqual("NEXT");
  });

  test("One-character dot symbols (.s, .S, .x) should be treated as DOT_SYMBOL", () => {
    const input = ".s .S .x";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("s");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token2.string).toEqual("S");

    const token3 = tokenizer.next_token();
    expect(token3.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token3.string).toEqual("x");
  });

  test("Two-character dot symbol (.ab) should be treated as DOT_SYMBOL", () => {
    const input = ".ab NEXT";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("ab");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.WORD);
    expect(token2.string).toEqual("NEXT");
  });

  test("Multiple dot symbols in sequence", () => {
    const input = ".first .second .third";
    const tokenizer = new Tokenizer(input, reference_location);

    const token1 = tokenizer.next_token();
    expect(token1.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token1.string).toEqual("first");

    const token2 = tokenizer.next_token();
    expect(token2.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token2.string).toEqual("second");

    const token3 = tokenizer.next_token();
    expect(token3.type).toEqual(TokenType.DOT_SYMBOL);
    expect(token3.string).toEqual("third");
  });

  test("Dot symbol mixed with other tokens", () => {
    const input = ": TEST-DEF   .symbol 42 + ;";
    const tokenizer = new Tokenizer(input, reference_location);

    const tokens = [];
    let token = tokenizer.next_token();
    while (token.type !== TokenType.EOS) {
      tokens.push(token);
      token = tokenizer.next_token();
    }

    expect(tokens.length).toEqual(5);
    expect(tokens[0].type).toEqual(TokenType.START_DEF);
    expect(tokens[0].string).toEqual("TEST-DEF");
    expect(tokens[1].type).toEqual(TokenType.DOT_SYMBOL);
    expect(tokens[1].string).toEqual("symbol");
    expect(tokens[2].type).toEqual(TokenType.WORD);
    expect(tokens[2].string).toEqual("42");
    expect(tokens[3].type).toEqual(TokenType.WORD);
    expect(tokens[3].string).toEqual("+");
    expect(tokens[4].type).toEqual(TokenType.END_DEF);
    expect(tokens[4].string).toEqual(";");
  });
});

describe("Marked string-redirect (<<'''…''')", () => {
  const reference_location = new CodeLocation({
    source: "test",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  function tokenize(input: string, streaming = false) {
    const tokenizer = new Tokenizer(input, reference_location, streaming);
    const tokens = [];
    let token = tokenizer.next_token();
    while (token && token.type !== TokenType.EOS) {
      tokens.push(token);
      token = tokenizer.next_token();
    }
    return tokens;
  }

  test("<<'''…''' tokenizes as one STRING flagged is_string_redirect", () => {
    const tokens = tokenize("<<'''hello world'''");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toEqual(TokenType.STRING);
    expect(tokens[0].string).toEqual("hello world");
    expect(tokens[0].is_string_redirect).toBe(true);
  });

  test(`<<"""…""" (double-quote form) tokenizes as a marked STRING`, () => {
    const tokens = tokenize(`<<"""hello"""`);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toEqual(TokenType.STRING);
    expect(tokens[0].string).toEqual("hello");
    expect(tokens[0].is_string_redirect).toBe(true);
  });

  test("the marker is followed by ordinary tokens", () => {
    const tokens = tokenize("REDIRECT< <<'''hi''' FINAL");
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.WORD,
      TokenType.STRING,
      TokenType.WORD,
    ]);
    expect(tokens[0].string).toEqual("REDIRECT<");
    expect(tokens[0].is_string_redirect).toBe(false);
    expect(tokens[1].string).toEqual("hi");
    expect(tokens[1].is_string_redirect).toBe(true);
    expect(tokens[2].string).toEqual("FINAL");
  });

  test("an ordinary triple-quoted string is not flagged", () => {
    const tokens = tokenize("'''hello'''");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toEqual(TokenType.STRING);
    expect(tokens[0].is_string_redirect).toBe(false);
  });

  test("the rule does not disturb < words or comparisons", () => {
    // `<`, `<REC!`, and `1 2 <` must all stay ordinary WORDs.
    expect(tokenize("<").map((t) => [t.type, t.string])).toEqual([
      [TokenType.WORD, "<"],
    ]);
    expect(tokenize("<REC!").map((t) => [t.type, t.string])).toEqual([
      [TokenType.WORD, "<REC!"],
    ]);
    expect(tokenize("1 2 <").map((t) => [t.type, t.string])).toEqual([
      [TokenType.WORD, "1"],
      [TokenType.WORD, "2"],
      [TokenType.WORD, "<"],
    ]);
  });

  test("<< not glued to a triple quote is not a marked string", () => {
    // `<<` with a space before the quotes is just a word.
    const tokens = tokenize("<< '''hello'''");
    expect(tokens.map((t) => [t.type, t.string, t.is_string_redirect])).toEqual(
      [
        [TokenType.WORD, "<<", false],
        [TokenType.STRING, "hello", false],
      ],
    );
  });

  test("is_string_redirect() reports the open trailing string in streaming mode", () => {
    // An open marked string (unterminated, streaming) reports true...
    const marked = new Tokenizer(
      "REDIRECT< <<'''hel",
      reference_location,
      true,
    );
    expect(marked.next_token().string).toEqual("REDIRECT<"); // WORD
    expect(marked.next_token()).toBeNull(); // open string -> null in streaming mode
    expect(marked.is_string_redirect()).toBe(true);
    expect(marked.get_string_value()).toEqual("hel");

    // ...while an open ordinary string reports false.
    const plain = new Tokenizer("REDIRECT< '''hel", reference_location, true);
    expect(plain.next_token().string).toEqual("REDIRECT<");
    expect(plain.next_token()).toBeNull();
    expect(plain.is_string_redirect()).toBe(false);
  });
});

describe("Raw string literals (r'…')", () => {
  const reference_location = new CodeLocation({
    source: "test",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  const content = (input: string) =>
    new Tokenizer(input, reference_location).next_token().string;

  const tokenize = (input: string) => {
    const tokenizer = new Tokenizer(input, reference_location);
    const out: any[] = [];
    let token: any;
    while ((token = tokenizer.next_token()) && token.type !== TokenType.EOS) {
      out.push([token.type, token.string]);
    }
    return out;
  };

  test("the r prefix turns escape processing off at single-delimiter width", () => {
    // The half of the prefix that does real work today: '…' processes the
    // whitelist, r'…' does not.
    expect(content(`'a\\nb'`)).toEqual("a\nb");
    expect(content(`r'a\\nb'`)).toEqual(`a\\nb`);
    expect(content(`"a\\tb"`)).toEqual("a\tb");
    expect(content(`r"a\\tb"`)).toEqual(`a\\tb`);
  });

  test("r'…' keeps a backslash pair verbatim where the whitelist would eat it", () => {
    expect(content(`r'C:\\\\Users'`)).toEqual(`C:\\\\Users`);
    expect(content(`'C:\\\\Users'`)).toEqual(`C:\\Users`);
  });

  test("r at triple width is no longer an alias", () => {
    // The bare form interprets the whitelist and only the r spelling keeps a
    // backslash. This is the assertion that catches a missing raw flag on the
    // triple-width call site.
    expect(content(`r'''a\\nb'''`)).toEqual(`a\\nb`); // raw: backslash + n
    expect(content(`'''a\\nb'''`)).toEqual("a\nb"); // bare: a real newline
    expect(content(`r"""a\\nb"""`)).toEqual(`a\\nb`);
    expect(content(`"""a\\nb"""`)).toEqual("a\nb");
  });

  test("a raw string can end in a backslash — Python cannot express this", () => {
    // The closing delimiter is never consulted for backslashes, at either width.
    expect(content(`r'C:\\'`)).toEqual(`C:\\`);
    expect(content(`r'''C:\\'''`)).toEqual(`C:\\`);
  });

  test("r glued to a non-quote stays an ordinary word", () => {
    expect(tokenize("rec")).toEqual([[TokenType.WORD, "rec"]]);
    expect(tokenize("r")).toEqual([[TokenType.WORD, "r"]]);
    expect(tokenize("RANGE")).toEqual([[TokenType.WORD, "RANGE"]]);
  });

  test("uppercase R is not a raw prefix", () => {
    // One spelling to teach; R'''…''' keeps lexing as a word, as it always has.
    expect(tokenize(`R'''foo'''`)).toEqual([[TokenType.WORD, `R'''foo'''`]]);
  });

  test("a raw string is an ordinary token in context", () => {
    expect(tokenize(`[ r'''a''' ]`)).toEqual([
      [TokenType.START_ARRAY, "["],
      [TokenType.STRING, "a"],
      [TokenType.END_ARRAY, "]"],
    ]);
  });

  test("the prefix is only recognised at the start of a token", () => {
    // Words are gathered without breaking on quote characters, so a trailing
    // `r` inside a word must not turn the rest into a raw string. This is what
    // keeps the new branch in transition_from_START collision-free.
    expect(tokenize(`WORDr'x'`)).toEqual([[TokenType.WORD, `WORDr'x'`]]);
    expect(tokenize(`FOOr'''x'''`)).toEqual([[TokenType.WORD, `FOOr'''x'''`]]);
  });

  test("the greedy quote-run rule is unaffected by the prefix", () => {
    const greedy = `'''string with 'single quotes'''''`;
    expect(content(`r${greedy}`)).toEqual(content(greedy));
    expect(content(`r${greedy}`)).toEqual(`string with 'single quotes''`);
  });

  test("the prefix does not compose with the redirect marker", () => {
    // Declined on purpose — the redirect grammar stays narrow. Both spellings
    // degrade to an ordinary word (a loud unknown-word error at run time)
    // rather than silently half-parsing.
    expect(tokenize(`<<r'''hi'''`)).toEqual([[TokenType.WORD, `<<r'''hi'''`]]);
    expect(tokenize(`r<<'''hi'''`)).toEqual([[TokenType.WORD, `r<<'''hi'''`]]);
    // ...while the unprefixed marker still redirects.
    const marked = new Tokenizer(`<<'''hi'''`, reference_location).next_token();
    expect(marked.is_string_redirect).toBe(true);
  });

  test("an empty raw string is empty, at both widths", () => {
    expect(content(`r''`)).toEqual("");
    expect(content(`r""`)).toEqual("");
  });

  test("an unterminated raw string throws, at both widths", () => {
    expect(() => content(`r'abc`)).toThrow(UnterminatedStringError);
    expect(() => content(`r'''abc`)).toThrow(UnterminatedStringError);
  });
});

describe("Triple-quoted strings interpret the escape whitelist", () => {
  const reference_location = new CodeLocation({
    source: "test",
    line: 1,
    column: 1,
    start_pos: 0,
  });

  const content = (input: string) =>
    new Tokenizer(input, reference_location).next_token().string;

  test("backslash escapes are interpreted, as at single-delimiter width", () => {
    expect(content(`'''a\\nb'''`)).toEqual("a\nb");
    expect(content(`'''a\\\\b'''`)).toEqual(`a\\b`);
    expect(content(`'''a\\nb'''`)).toEqual(content(`'a\\nb'`));
  });

  test("regexes and paths survive verbatim", () => {
    // Why a whitelist rather than "every backslash escapes something":
    // \d, \w, \U and \. are outside it, so both characters stay literal.
    expect(content(`'''zoom\\.us|meet\\.google\\.com'''`)).toEqual(
      `zoom\\.us|meet\\.google\\.com`,
    );
    expect(content(`'''\\d+\\w*\\U0001'''`)).toEqual(`\\d+\\w*\\U0001`);
  });

  test("an escaped quote is content and can never close the literal", () => {
    // The whole point of the release: an LLM writes `today\'s` because that is
    // correct one delimiter width narrower, and now it means the same thing here.
    expect(content(`'''today\\'s plan'''`)).toEqual("today's plan");
    expect(content(`"""say \\"hi\\" now"""`)).toEqual('say "hi" now');
    // Escapes resolve before delimiter detection, so an escaped run is content.
    expect(content(`'''a \\'\\'\\' b'''`)).toEqual("a ''' b");
  });

  test("unescaped tripling still closes early", () => {
    // Unchanged: this change moves the silent failure classes, not the loud one.
    expect(content(`'''today'''s plan'''`)).toEqual("today");
  });

  test("a literal ending in a backslash no longer parses", () => {
    // New breaking case: `\'` is consumed as an escaped quote, leaving `''`
    // which cannot close. Louder than corruption — the fix is the r form, which
    // is asserted intact above.
    expect(() => content(`'''C:\\'''`)).toThrow(UnterminatedStringError);
    expect(content(`r'''C:\\'''`)).toEqual(`C:\\`);
  });

  test("ordinary content is untouched", () => {
    expect(content(`'''Fetched today's mail.'''`)).toEqual(
      `Fetched today's mail.`,
    );
    expect(content(`"""'''.taco.style''' JQ@"""`)).toEqual(
      `'''.taco.style''' JQ@`,
    );
  });

  test("a marked redirect string escapes the same way", () => {
    // There is no <<r'''…''' form, so a redirect literal is always
    // escape-processing; content carrying a literal backslash must double it.
    const tokenizer = new Tokenizer(`<<'''a\\nb'''`, reference_location);
    const token = tokenizer.next_token();
    expect(token.string).toEqual("a\nb");
    expect(token.is_string_redirect).toBe(true);
  });
});
