import { StandardInterpreter } from "../../interpreter";
import { Module } from "../../module";
import { StringRedirectError } from "../../errors";
import {
  isStringRedirectSink,
  StringRedirectSink,
} from "../../string_redirect_sink";

// A sink that records every delta, plus a `{ closed: true }` marker when it closes
// or aborts. Mirrors what a caller's sink would do, except it appends to an array
// instead of writing to a socket.
class RecordingSink extends StringRedirectSink {
  constructor(private record: any[]) {
    super();
  }
  write(delta: string) {
    this.record.push(delta);
  }
  close() {
    this.record.push({ closed: true });
  }
  abort() {
    this.record.push({ closed: true });
  }
  toJSON() {
    return { __type: "RecordingSink" };
  }
}
function recordingSink(record: any[]): StringRedirectSink {
  return new RecordingSink(record);
}

// A sink that throws while writing — a CONTRACT VIOLATION (sinks must not throw).
// The interpreter calls write() unguarded, so the throw aborts the streaming turn
// and the message string never lands on the stack. Used to pin that behavior.
class ThrowingSink extends StringRedirectSink {
  constructor(private record: any[]) {
    super();
  }
  write(delta: string) {
    this.record.push(delta);
    throw new Error("sink boom");
  }
  close() {
    this.record.push({ closed: true });
  }
  abort() {
    this.record.push({ closed: true });
  }
  toJSON() {
    return { __type: "ThrowingSink" };
  }
}
function throwingSink(record: any[]): StringRedirectSink {
  return new ThrowingSink(record);
}

// A stand-in for a caller: its word pushes a sink onto the stack. The redirect
// designation lives on the string literal (`<<'''…'''`), not on this word, so
// REDIRECT< does nothing but supply the transport. The word name is arbitrary
// fixture text; the library knows nothing about it.
class SinkModule extends Module {
  constructor(private sinkFactory: () => StringRedirectSink) {
    super("sinktest");
    this.add_module_word("REDIRECT<", this.word_REDIRECT.bind(this));
  }

  async word_REDIRECT(interp: StandardInterpreter) {
    interp.stack_push(this.sinkFactory());
  }
}

function makeInterp(
  sinkFactory: () => StringRedirectSink,
): StandardInterpreter {
  return new StandardInterpreter([new SinkModule(sinkFactory)]);
}

// A completed redirect leaves `( sink -- sink string )`: the message string on
// top, the (now-closed) sink beneath it. This helper asserts that shape.
function expectSinkThenString(interp: StandardInterpreter, message: string) {
  const items = interp.get_stack().get_items();
  expect(items).toHaveLength(2);
  expect(isStringRedirectSink(items[0])).toBe(true);
  expect(items[1]).toBe(message);
}

describe("Interpreter.streamingRun — marked string redirect into a StringRedirectSink", () => {
  test("feeds only new suffixes across chunks; closes once; leaves sink + string on the stack", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`REDIRECT< <<'''hel`, false);
    await interp.streamingRun(`REDIRECT< <<'''hello wor`, false);
    await interp.streamingRun(`REDIRECT< <<'''hello world'''`, true);

    expect(record).toEqual(["hel", "lo wor", "ld", { closed: true }]);
    expectSinkThenString(interp, "hello world");
  });

  test("a complete marked string in a single done call redirects and closes once", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`REDIRECT< <<'''hello world'''`, true);

    expect(record).toEqual(["hello world", { closed: true }]);
    expectSinkThenString(interp, "hello world");
  });

  test("the redirected string behaves like an ordinary string for following words", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // UPPERCASE is a standard string word; it should see the completed message
    // (the top of the stack), leaving the sink beneath untouched.
    await interp.streamingRun(`REDIRECT< <<'''hello''' UPPERCASE`, true);

    expect(record).toEqual(["hello", { closed: true }]);
    expectSinkThenString(interp, "HELLO");
  });

  test("a marked string with no sink on the stack throws and redirects nothing", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await expect(interp.streamingRun(`<<'''reply'''`, true)).rejects.toThrow(
      StringRedirectError,
    );

    expect(record).toEqual([]);
    expect(interp.get_stack().get_items()).toEqual([]);
  });

  test("the sink must be on top: a value between REDIRECT< and the marked string throws", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // `5` buries the sink, so when the marked string runs the stack top is not a
    // sink and the redirect fails fast rather than redirecting into the wrong value.
    await expect(
      interp.streamingRun(`REDIRECT< 5 <<'''reply'''`, true),
    ).rejects.toThrow(StringRedirectError);

    expect(record).toEqual([]);
  });

  test("a comment between REDIRECT< and the marked string is allowed (no adjacency rule)", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // Unlike a positional rule, the marker designates the string, so a comment
    // (or any non-stack-disturbing token) between the sink and the string is fine.
    await interp.streamingRun(`REDIRECT< # note\n <<'''reply'''`, true);

    expect(record).toEqual(["reply", { closed: true }]);
    expectSinkThenString(interp, "reply");
  });

  test("an ordinary string adjacent to REDIRECT< does not redirect", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // Only a marked string redirects. An ordinary string just pushes, even with a
    // sink sitting right beneath it.
    await interp.streamingRun(`REDIRECT< '''ordinary'''`, true);

    expect(record).toEqual([]);
    expect(interp.stack_peek()).toBe("ordinary");
    expect(interp.get_stack().get_items()).toHaveLength(2);
  });

  test("strings without a marker do not redirect", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`'''hello''' '''world'''`, true);

    expect(record).toEqual([]);
    expect(interp.get_stack().get_items()).toEqual(["hello", "world"]);
  });

  test("multiple redirects in one run, each into its own sink (no cardinality policy)", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // The caller positions a fresh sink on top before each marked string; the
    // library imposes no limit. Result stack: ( sink1 "a" sink2 "b" ).
    await interp.streamingRun(`REDIRECT< <<'''a''' REDIRECT< <<'''b'''`, true);

    expect(record).toEqual(["a", { closed: true }, "b", { closed: true }]);
    const items = interp.get_stack().get_items();
    expect(items).toHaveLength(4);
    expect(isStringRedirectSink(items[0])).toBe(true);
    expect(items[1]).toBe("a");
    expect(isStringRedirectSink(items[2])).toBe(true);
    expect(items[3]).toBe("b");
  });

  test("a sink that throws while writing aborts the turn (contract: sinks must not throw)", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => throwingSink(record));

    // The sink violates the contract by throwing; the interpreter calls write()
    // unguarded, so the error propagates and the turn aborts.
    await expect(
      interp.streamingRun(`REDIRECT< <<'''reply'''`, true),
    ).rejects.toThrow("sink boom");

    // The interpreter still abandons the in-progress redirect on its way out (abort
    // cleanup runs), but the message string never landed on the stack.
    expect(record).toEqual(["reply", { closed: true }]);

    // The interpreter is not left in a bad state: a fresh, well-behaved turn works.
    const record2: any[] = [];
    const interp2 = makeInterp(() => recordingSink(record2));
    await interp2.streamingRun(`REDIRECT< <<'''again'''`, true);
    expect(record2).toEqual(["again", { closed: true }]);
  });

  test("abortStreamingRun() mid-message ends the sink by reference (runs its abort cleanup)", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`REDIRECT< <<'''hel`, false);
    expect(record).toEqual(["hel"]);
    expect(isStringRedirectSink(interp.stack_peek())).toBe(true);

    await interp.abortStreamingRun("upstream ended");

    // The sink's abort cleanup ran via reference. Abort does NOT touch the stack
    // (the caller owns hygiene), so the now-closed sink remains.
    expect(record).toEqual(["hel", { closed: true }]);
    const items = interp.get_stack().get_items();
    expect(items).toHaveLength(1);
    expect(isStringRedirectSink(items[0])).toBe(true);
  });

  test("if the stack top changes mid-redirect, finish throws and still closes the original sink", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // Start an open redirect (sink on top, partial delta fed).
    await interp.streamingRun(`REDIRECT< <<'''hel`, false);
    expect(record).toEqual(["hel"]);

    // Something buries the sink before the string completes.
    interp.stack_push(5);

    // Completing the marked string detects the mismatch, aborts the originally
    // active sink by reference (its abort cleanup runs), then throws.
    await expect(
      interp.streamingRun(`REDIRECT< <<'''hello'''`, true),
    ).rejects.toThrow(StringRedirectError);
    expect(record).toEqual(["hel", { closed: true }]);
  });

  test("a marked triple-quoted string redirects escape-processed content", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // Marked strings are triple-quoted and so share the ordinary escape
    // whitelist: a backslash-n is a newline. The sink receives exactly what
    // lands on the stack.
    await interp.streamingRun(`REDIRECT< <<'''a\\nb'''`, true);

    expect(record).toEqual(["a\nb", { closed: true }]);
    expectSinkThenString(interp, "a\nb");
  });

  test("after abortStreamingRun, the same interpreter can start a fresh redirect turn", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // First turn: partial, then aborted mid-message.
    await interp.streamingRun(`REDIRECT< <<'''hel`, false);
    await interp.abortStreamingRun("upstream ended");

    // Reusing the SAME interpreter must not skip tokens via a stale streaming
    // cursor — REDIRECT< has to execute again and the new message must redirect.
    await interp.streamingRun(`REDIRECT< <<'''again'''`, true);

    expect(record).toEqual([
      "hel",
      { closed: true },
      "again",
      { closed: true },
    ]);
    // The newest message is on top; earlier (closed) sinks remain as clutter the
    // caller would drop.
    expect(interp.stack_peek()).toBe("again");
  });

  // The recorded deltas (writes) excluding the { closed: true } close marker.
  function recordedText(record: any[]): string {
    return record.filter((d) => typeof d === "string").join("");
  }

  test("closing ''' split across done=false chunks emits no stray trailing quotes", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // The closing delimiter arrives one quote at a time. Each not-yet-confirmed
    // quote must be held back, so the boundary chunks emit NOTHING new — the stray
    // `'` writes were the bug. Assert the exact record after every feed.
    await interp.streamingRun(`REDIRECT< <<'''hello world`, false);
    expect(record).toEqual(["hello world"]);
    await interp.streamingRun(`REDIRECT< <<'''hello world'`, false);
    expect(record).toEqual(["hello world"]); // held-back `'`, no write
    await interp.streamingRun(`REDIRECT< <<'''hello world''`, false);
    expect(record).toEqual(["hello world"]); // held-back `''`, no write
    await interp.streamingRun(`REDIRECT< <<'''hello world'''`, true);
    expect(record).toEqual(["hello world", { closed: true }]); // closes, no extra write

    expectSinkThenString(interp, "hello world");
  });

  test('closing """ split across done=false chunks emits no stray trailing quotes', async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`REDIRECT< <<"""hello world`, false);
    expect(record).toEqual(["hello world"]);
    await interp.streamingRun(`REDIRECT< <<"""hello world"`, false);
    expect(record).toEqual(["hello world"]);
    await interp.streamingRun(`REDIRECT< <<"""hello world""`, false);
    expect(record).toEqual(["hello world"]);
    await interp.streamingRun(`REDIRECT< <<"""hello world"""`, true);
    expect(record).toEqual(["hello world", { closed: true }]);

    expectSinkThenString(interp, "hello world");
  });

  test("a held-back quote flushes once a non-quote char proves it content", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    await interp.streamingRun(`REDIRECT< <<'''ab'`, false);
    expect(record).toEqual(["ab"]); // `'` held back as a possible closing delimiter
    await interp.streamingRun(`REDIRECT< <<'''ab'c`, false);
    expect(record).toEqual(["ab", "'c"]); // `c` proves the `'` is content; it flushes
    await interp.streamingRun(`REDIRECT< <<'''ab'c'''`, true);
    expect(record).toEqual(["ab", "'c", { closed: true }]);

    expectSinkThenString(interp, "ab'c");
  });

  test("content that genuinely ends in a quote still emits it at close", async () => {
    const record: any[] = [];
    const interp = makeInterp(() => recordingSink(record));

    // Greedy literal: `<<'''hello''''` carries content `hello'` (the 4th quote is
    // content, the trailing `'''` closes). Feeding the closing `''''` one quote at a
    // time holds every quote back, then the genuine trailing `'` flushes at close —
    // it must not be over-stripped.
    await interp.streamingRun(`REDIRECT< <<'''hello`, false);
    expect(record).toEqual(["hello"]);
    await interp.streamingRun(`REDIRECT< <<'''hello'`, false);
    expect(record).toEqual(["hello"]);
    await interp.streamingRun(`REDIRECT< <<'''hello''`, false);
    expect(record).toEqual(["hello"]);
    await interp.streamingRun(`REDIRECT< <<'''hello'''`, false);
    expect(record).toEqual(["hello"]); // tokenizer closes early here, but nothing commits
    await interp.streamingRun(`REDIRECT< <<'''hello''''`, true);
    expect(record).toEqual(["hello", "'", { closed: true }]); // real trailing `'` flushes

    expectSinkThenString(interp, "hello'");
  });

  test("every chunk boundary yields the finalized string with no stray quotes", async () => {
    // The ticket's invariant: for EVERY chunking of a marked literal, the streamed
    // deltas must concat to exactly the string left on the stack. Split the program
    // at each byte position (an open done=false feed, then the whole thing on done),
    // which exercises both the 1-quote and 2-quote mid-delimiter boundaries.
    const program = `REDIRECT< <<'''hello world'''`;
    for (let cut = 1; cut < program.length; cut++) {
      const record: any[] = [];
      const interp = makeInterp(() => recordingSink(record));

      await interp.streamingRun(program.slice(0, cut), false);
      await interp.streamingRun(program, true);

      expect(recordedText(record)).toBe("hello world"); // concat === finalized, every cut
      expect(record[record.length - 1]).toEqual({ closed: true });
      expectSinkThenString(interp, "hello world");
    }
  });

  test("a marked redirect string inside a definition is rejected", async () => {
    const interp = makeInterp(() => recordingSink([]));

    // v1 does not support redirect literals inside word definitions: the string
    // is fed and consumed at execution time, which has no meaning while compiling.
    await expect(
      interp.streamingRun(`: REPLY <<'''hi''' ;`, true),
    ).rejects.toThrow(StringRedirectError);
  });
});
