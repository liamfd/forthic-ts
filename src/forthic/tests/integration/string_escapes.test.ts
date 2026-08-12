import { StandardInterpreter } from "../../interpreter";

let interp: StandardInterpreter;

beforeEach(async () => {
  interp = new StandardInterpreter([], "America/Los_Angeles");
});

describe("String escape sequences (PR 7.5)", () => {
  describe("Whitelist escapes — interpreted in regular strings", () => {
    test("\\n becomes newline", async () => {
      await interp.run("'a\\nb'");
      expect(interp.stack_pop()).toBe("a\nb");
    });

    test("\\t becomes tab", async () => {
      await interp.run("'a\\tb'");
      expect(interp.stack_pop()).toBe("a\tb");
    });

    test("\\r becomes carriage return", async () => {
      await interp.run("'a\\rb'");
      expect(interp.stack_pop()).toBe("a\rb");
    });

    test("\\\\ becomes single backslash", async () => {
      await interp.run("'a\\\\b'");
      expect(interp.stack_pop()).toBe("a\\b");
    });

    test('\\" inside double-quoted string becomes literal "', async () => {
      await interp.run('"a\\"b"');
      expect(interp.stack_pop()).toBe('a"b');
    });

    test("\\' inside single-quoted string becomes literal '", async () => {
      await interp.run("'a\\'b'");
      expect(interp.stack_pop()).toBe("a'b");
    });

    test("\\0 becomes NUL character", async () => {
      await interp.run("'a\\0b'");
      expect(interp.stack_pop()).toBe("a\0b");
    });

    test("multiple escapes in one string", async () => {
      await interp.run("'line1\\nline2\\tcol'");
      expect(interp.stack_pop()).toBe("line1\nline2\tcol");
    });
  });

  describe("Unrecognized escapes — left as literal pair (regex/path safety)", () => {
    test("\\d stays literal (regex digit class)", async () => {
      await interp.run("'\\d+'");
      expect(interp.stack_pop()).toBe("\\d+");
    });

    test("\\w stays literal (regex word class)", async () => {
      await interp.run("'\\w'");
      expect(interp.stack_pop()).toBe("\\w");
    });

    test("\\s stays literal (regex whitespace class)", async () => {
      await interp.run("'\\s+'");
      expect(interp.stack_pop()).toBe("\\s+");
    });

    test("\\U stays literal (Windows path safety)", async () => {
      await interp.run("'C:\\Users\\foo'");
      expect(interp.stack_pop()).toBe("C:\\Users\\foo");
    });

    test("regex pattern works through RE-MATCH after escape change", async () => {
      await interp.run("'abc123' '\\d+' RE-MATCH? ");
      expect(interp.stack_pop()).toBe(true);
    });
  });

  // These asserted that triple-quoted strings were fully raw. They now assert
  // the same escape whitelist the single-delimiter forms use, so the escaping
  // regime no longer depends on how many quote characters were counted.
  //
  // The whitelist is what keeps this safe: only \n \t \r \0 \\ \" \' are
  // interpreted, so the regex and Windows-path cases are unaffected — see the
  // unchanged test below and the single-delimiter cases above.
  describe("Triple-quoted strings — same escapes as single-delimiter", () => {
    test("triple-quoted interprets \\n", async () => {
      await interp.run("'''a\\nb'''");
      expect(interp.stack_pop()).toBe("a\nb");
    });

    test("triple-quoted interprets \\\\", async () => {
      await interp.run("'''a\\\\b'''");
      expect(interp.stack_pop()).toBe("a\\b");
    });

    test("an escaped quote is content and cannot close the string", async () => {
      // The defect this change exists for: an LLM writes `today\'s` because
      // that is correct one delimiter width narrower.
      await interp.run("'''today\\'s plan'''");
      expect(interp.stack_pop()).toBe("today's plan");
    });

    test("triple-quoted regex pattern with backslashes", async () => {
      await interp.run("'''\\d+\\w*'''");
      expect(interp.stack_pop()).toBe("\\d+\\w*");
    });
  });

  describe("Caret quote char removed", () => {
    test("^ no longer starts a string — treated as part of a word", async () => {
      // With ^ removed from quote_chars, the bare ^ token becomes an
      // (unknown) word reference, not a string literal.
      let threw = false;
      try {
        await interp.run("^foo^");
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe("Escape sequences compose with existing words", () => {
    test("LINES on a string built with \\n", async () => {
      await interp.run("'a\\nb\\nc' LINES");
      expect(interp.stack_pop()).toEqual(["a", "b", "c"]);
    });

    test("REPLACE handles strings with embedded newlines", async () => {
      await interp.run("'foo\\nbar' '\\n' ' | ' REPLACE");
      expect(interp.stack_pop()).toBe("foo | bar");
    });
  });
});
