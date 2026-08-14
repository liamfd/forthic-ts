import { UnterminatedStringError } from "../../tokenizer";
import { StandardInterpreter } from "../../interpreter";
import { Module } from "../../module";
import { MissingSemicolonError } from "../../errors";

// streamingRun is a plain async method: callers `await` each chunk and execution
// runs up to the resume point. There is nothing to drain — a marked redirect
// string streams its text out through its StringRedirectSink (covered in
// string_redirect.test.ts), so these tests only assert execution semantics.
describe("Interpreter.streamingRun", () => {
  let interp: StandardInterpreter;

  beforeEach(() => {
    interp = new StandardInterpreter();
  });

  test("incrementally streams an open string, then executes a trailing word split across chunks", async () => {
    await interp.streamingRun(`"The quick brown`, false);
    await interp.streamingRun(`"The quick brown fox jumps`, false);
    await interp.streamingRun(`"The quick brown fox jumps over"`, false);
    // UPPER is the start of UPPERCASE — an incomplete trailing word, not executed yet.
    await interp.streamingRun(`"The quick brown fox jumps over" UPPER`, false);
    await interp.streamingRun(`"The quick brown fox jumps over" UPPERCASE`, true);

    expect(interp.get_stack().get_items()).toEqual([
      "THE QUICK BROWN FOX JUMPS OVER",
    ]);
  });

  test("a raw string survives every chunk boundary, including between r and its quote", async () => {
    // The prefix is a lookahead from transition_from_START, so a chunk ending on
    // the bare `r` must be held back as an incomplete trailing token and re-read
    // once the quote arrives — the same rule that protects a half-streamed word.
    const program = `[ r'a\\nb' ] 0 NTH`;
    for (let cut = 1; cut < program.length; cut++) {
      const streamed = new StandardInterpreter();
      await streamed.streamingRun(program.slice(0, cut), false);
      await streamed.streamingRun(program, true);
      expect(streamed.get_stack().get_items()).toEqual(["a\\nb"]);
    }
  });

  test("multi-line stream ending with word execution using incremental streaming", async () => {
    const interp = new StandardInterpreter();

    // Define the EMAIL word
    await interp.run(': EMAIL   "email called";');

    // Create multi-line input ending with EMAIL
    const input = `"""Create a new email to test@test.com with subject 'A Haiku About Life' and body:

Morning sun rises
Life flows like gentle river
Night brings peaceful rest""" EMAIL`;

    // Simulate streaming by calling streamingRun with increasing substrings
    for (let i = 1; i <= input.length; i++) {
      const substring = input.substring(0, i);
      const isDone = i === input.length; // Only mark as done on the final iteration

      await interp.streamingRun(substring, isDone);

      // If we're done, verify the EMAIL word was executed
      if (isDone) {
        const stackItems = interp.get_stack().get_items();
        expect(stackItems.length).toBe(2);
        const top_item = interp.stack_pop();
        expect(top_item).toEqual("email called");
      }
    }
  });

  test("executes complete tokens and skips the last incomplete token (done=false)", async () => {
    // Imagine the Forthic code "1 2 +"
    // When the code is not final (done=false), streamingRun should execute only "1" and "2"
    await interp.streamingRun("1 2 +", true);

    // The literal handlers should push numeric values.
    // In this case only tokens for "1" and "2" were executed.
    expect(interp.get_stack().get_items()).toEqual([3]);
  });

  test("executes the final token when done flag is true", async () => {
    // First call: pass the incomplete code. Only tokens "1" and "2" will execute.
    await interp.streamingRun("1 2 +", false);
    expect(interp.get_stack().get_items()).toEqual([1, 2]);

    // Second call: pass the full code, and now indicate that the stream is done.
    // The final plus token is now executed – which pops 1 and 2 and pushes 3.
    await interp.streamingRun("1 2 +", true);

    expect(interp.get_stack().get_items()).toEqual([3]);
  });

  test("executes only new tokens between calls", async () => {
    // Simulate streaming where each call gets the full code so far.
    // First, the interpreter sees only "1".
    await interp.streamingRun("1", false);
    expect(interp.get_stack().get_items()).toEqual([]);

    // Then, the code grows to "1 2". The new token "2" is executed.
    await interp.streamingRun("1 2", false);
    expect(interp.get_stack().get_items()).toEqual([1]);

    // Finally, the full code "1 2 +" is provided, and done=true executes the final token (plus).
    await interp.streamingRun("1 2 +", true);
    // With the plus executed, 1 and 2 are replaced by 3.
    expect(interp.get_stack().get_items()).toEqual([3]);
  });

  test("a thrown error mid-turn drops the session so the next turn starts from the top", async () => {
    // Advance the execution cursor on a partial chunk (executes "1", resume at "2").
    await interp.streamingRun("1 2", false);
    expect(interp.get_stack().get_items()).toEqual([1]);

    // The next chunk throws partway through (unknown word) after "2" has run.
    await expect(interp.streamingRun("1 2 BOGUS", true)).rejects.toThrow();
    expect(interp.get_stack().get_items()).toEqual([1, 2]);

    // A brand-new turn must execute from token 0, not skip past the stale resume
    // point left by the aborted turn.
    await interp.streamingRun("10 20 +", true);
    expect(interp.get_stack().get_items()).toEqual([1, 2, 30]);
  });

  test("streaming complex arithmetic", async () => {
    await interp.streamingRun("1 2 + 3", false);
    expect(interp.get_stack().get_items()).toEqual([3]);

    await interp.streamingRun("1 2 + 3 +", false);
    expect(interp.get_stack().get_items()).toEqual([3, 3]);

    await interp.streamingRun("1 2 + 3 + 4 + 5 + 2 * 4 -", true);
    expect(interp.get_stack().get_items()).toEqual([26]);
  });

  test("streaming MAP", async () => {
    await interp.streamingRun(`[1 2 3] `, false);
    expect(interp.stack_peek()).toEqual(3);

    await interp.streamingRun(`[1 2 3] "2 *"`, false);
    expect(interp.stack_peek()).toEqual([1, 2, 3]);

    await interp.streamingRun(`[1 2 3] "2 *" MAP`, false);
    expect(interp.stack_peek()).toEqual("2 *");

    await interp.streamingRun(`[1 2 3] "2 *" MAP`, true);
    expect(interp.stack_peek()).toEqual([2, 4, 6]);
  });

  test("streaming MAP with module", async () => {
    const myInterp = new StandardInterpreter([new SampleModule()]);
    await myInterp.streamingRun(`[1 2 3] "SEND-EMAIL"`, false);
    expect(myInterp.stack_peek()).toEqual([1, 2, 3]);

    await myInterp.streamingRun(`[1 2 3] "SEND-EMAIL" MAP`, true);
    expect(myInterp.stack_peek()).toEqual(["sent 1", "sent 2", "sent 3"]);
  });

  // Drives the interpreter the way a live token stream does: one streamingRun
  // call per growing prefix (done=false), then a final done=true with the whole
  // string. This incremental path is the only one that exposed the resume
  // pointer rewinding and re-executing already-run `[` (START_ARRAY) tokens,
  // which pushed duplicate Token('[') markers onto the stack.
  describe("incremental (per-delta) array streaming", () => {
    async function driveIncrementally(
      interp: StandardInterpreter,
      code: string,
    ): Promise<void> {
      for (let i = 1; i <= code.length; i++) {
        await interp.streamingRun(code.slice(0, i), false);
      }
      await interp.streamingRun(code, true);
    }

    test("nested array leaves no stray bracket markers", async () => {
      const interp = new StandardInterpreter();
      await driveIncrementally(interp, `[ [ "a" "b" ] ]`);
      expect(interp.get_stack().get_items()).toEqual([[["a", "b"]]]);
    });

    test("record + trailing word receives the record, not a raw token", async () => {
      const interp = new StandardInterpreter();
      await driveIncrementally(interp, `[ [ "k1" 1 ] [ "k2" 2 ] ] REC`);
      expect(interp.stack_pop()).toEqual({ k1: 1, k2: 2 });
      expect(interp.get_stack().get_items()).toEqual([]);
    });

    test("triple-quoted string inside an array streams without corruption", async () => {
      const interp = new StandardInterpreter();
      await driveIncrementally(
        interp,
        `[ [ "instructions" '''do the thing''' ] ] REC`,
      );
      expect(interp.stack_pop()).toEqual({ instructions: "do the thing" });
      expect(interp.get_stack().get_items()).toEqual([]);
    });
  });

});

test("Unterminated string", async () => {
  const interp = new StandardInterpreter();
  await interp.streamingRun(`''''`, false);

  await expect(interp.streamingRun(`''''`, true)).rejects.toThrow(
    UnterminatedStringError,
  );
});

describe("streamingRun end-of-turn validation", () => {
  test("a completed turn with an unterminated definition throws MissingSemicolonError", async () => {
    // done=true means end of input. `: FOO 1` never closes the definition, so
    // this must fail the same way run(": FOO 1") does — not silently accept it.
    const interp = new StandardInterpreter();
    await expect(interp.streamingRun(": FOO 1", true)).rejects.toBeInstanceOf(
      MissingSemicolonError,
    );
  });

  test("a completed, well-formed definition is defined and usable (EOS is a no-op here)", async () => {
    const interp = new StandardInterpreter();
    await interp.streamingRun(": DOUBLE 2 * ;", true);
    await interp.run("5 DOUBLE");
    expect(interp.get_stack().get_items()).toEqual([10]);
  });

  test("a definition split across chunks is NOT validated mid-stream (done=false)", async () => {
    // The `:` opens a definition that only closes in the final chunk. Mid-stream
    // pumps must not raise MissingSemicolonError, or streamed definitions break.
    const interp = new StandardInterpreter();
    await interp.streamingRun(": DOUBLE 2", false);
    await interp.streamingRun(": DOUBLE 2 *", false);
    await interp.streamingRun(": DOUBLE 2 * ;", true);
    await interp.run("5 DOUBLE");
    expect(interp.get_stack().get_items()).toEqual([10]);
  });
});

test("Nested string issue", async () => {
  // Won't throw an error because we're not done yet
  let interp = new StandardInterpreter();
  await interp.streamingRun(`"""Reply saying "Thanks`, false);

  // Should now handle nested quotes correctly (no longer throws error)
  interp = new StandardInterpreter();
  await expect(
    interp.streamingRun(`"""Reply saying "Thanks""""`, true),
  ).resolves.toBeUndefined();
});

class SampleModule extends Module {
  constructor() {
    super("sample");
    this.add_module_word("SEND-EMAIL", this.word_SEND_EMAIL.bind(this));
  }

  // ( email -- )
  async word_SEND_EMAIL(interp: StandardInterpreter) {
    const email = interp.stack_pop();
    interp.stack_push(`sent ${email}`);
  }
}
