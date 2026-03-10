import { TokenType, Token, Tokenizer, CodeLocation } from "./tokenizer.js";
import { Module, Word, PushValueWord, DefinitionWord } from "./module.js";
import { PositionedString } from "./tokenizer.js";
import {
  UnknownWordError,
  UnknownModuleError,
  StackUnderflowError,
  UnknownTokenError,
  MissingSemicolonError,
  ExtraSemicolonError,
  ModuleError,
  TooManyAttemptsError,
  WordExecutionError,
  ForthicError,
  IntentionalStopError,
} from "./errors.js";
import { LiteralHandler, to_bool, to_float, to_int, to_time, to_literal_date, to_zoned_datetime } from "./literals.js";
import { CoreModule } from "./modules/standard/core_module.js";
import { ArrayModule } from "./modules/standard/array_module.js";
import { RecordModule } from "./modules/standard/record_module.js";
import { StringModule } from "./modules/standard/string_module.js";
import { MathModule } from "./modules/standard/math_module.js";
import { BooleanModule } from "./modules/standard/boolean_module.js";
import { JsonModule } from "./modules/standard/json_module.js";
import { DateTimeModule } from "./modules/standard/datetime_module.js";

type Timestamp = {
  label: string;
  time_ms: number;
};

type HandleErrorFunction = (e: Error, interp: Interpreter) => Promise<void>;

/**
 * StartModuleWord - Handles module creation and switching
 *
 * Pushes a module onto the module stack, creating it if necessary.
 * An empty name refers to the app module.
 */
class StartModuleWord extends Word {
  async execute(interp: Interpreter): Promise<void> {
    const self = this;

    // The app module is the only module with a blank name
    if (self.name === "") {
      interp.module_stack_push(interp.get_app_module());
      return;
    }

    // If the module is used by the current module, push it onto the stack, otherwise
    // create a new module.
    let module = interp.cur_module().find_module(self.name);
    if (!module) {
      module = new Module(self.name);
      interp.cur_module().register_module(module.name, module.name, module);

      // If we're at the app module, also register with interpreter
      if (interp.cur_module().name === "") {
        interp.register_module(module);
      }
    }
    interp.module_stack_push(module);
  }
}

/**
 * EndModuleWord - Pops the current module from the module stack
 *
 * Completes module context and returns to the previous module.
 */
class EndModuleWord extends Word {
  constructor() {
    super("}");
  }

  async execute(interp: Interpreter): Promise<void> {
    interp.module_stack_pop();
  }
}

/**
 * EndArrayWord - Collects items from stack into an array
 *
 * Pops items from the stack until a START_ARRAY token is found,
 * then pushes them as a single array in the correct order.
 */
class EndArrayWord extends Word {
  constructor() {
    super("]");
  }

  async execute(interp: Interpreter): Promise<void> {
    const items = [];
    let item = interp.stack_pop();
    // NOTE: This won't infinite loop because interp.stack_pop() will eventually fail
    while (true) {
      if (item instanceof Token && item.type == TokenType.START_ARRAY) break;
      items.push(item);
      item = interp.stack_pop();
    }
    items.reverse();
    interp.stack_push(items);
    return;
  }
}

/**
 * Stack - Wrapper for the interpreter's data stack
 *
 * Provides stack operations with support for array indexing via Proxy.
 * Handles PositionedString unwrapping and provides JSON serialization.
 * Items can be accessed with bracket notation (e.g., stack[0]).
 */
export class Stack {
  private items: any[];

  constructor(items: any[] = []) {
    this.items = items;

    // Return a Proxy to support array indexing
    return new Proxy(this, {
      get(target, prop) {
        // If it's a number or string that looks like a number, treat as array index
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target.items[index];
        }
        // Otherwise return the property from the target object
        return target[prop as keyof Stack];
      },
      set(target, prop, value) {
        // If it's a number or string that looks like a number, set array index
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          target.items[index] = value;
          return true;
        }
        // Don't allow setting readonly properties like 'length'
        if (prop === 'length') {
          return false;
        }
        // Otherwise set the property on the target object (using any to bypass type checking)
        (target as any)[prop] = value;
        return true;
      }
    });
  }

  get_items(): any[] {
    return this.items.map((item) => {
      if (item instanceof PositionedString) {
        return item.valueOf();
      }
      return item;
    });
  }

  get_raw_items(): any[] {
    return this.items;
  }

  set_raw_items(items: any[]) {
    this.items = items;
  }

  toJSON() {
    return this.items;
  }

  pop(): any {
    return this.items.pop();
  }

  push(item: any) {
    this.items.push(item);
  }

  // Add length property
  get length() {
    return this.items.length;
  }

  // Duplicate stack with a shallow copy of items
  dup(): Stack {
    return new Stack(this.items.slice());
  }
}

/**
 * Interpreter - Base Forthic interpreter
 *
 * Core interpreter that tokenizes and executes Forthic code.
 * Manages the data stack, module stack, and execution context.
 *
 * Features:
 * - Stack-based execution model
 * - Module system with imports and namespacing
 * - Literal handlers for parsing values (numbers, dates, booleans, etc.)
 * - Error handling with recovery attempts
 * - Profiling and performance tracking
 * - Streaming execution support
 *
 * Note: This is the base interpreter without standard library modules.
 * Use StandardInterpreter for a full-featured interpreter with stdlib.
 */
export class Interpreter {
  private timezone: Temporal.TimeZoneLike;
  private stack: Stack;
  private app_module: Module;
  private module_stack: Module[];
  private registered_modules: { [key: string]: Module };
  private tokenizer_stack: Tokenizer[];
  private previous_token: Token | null;
  private handleError?: HandleErrorFunction;
  private maxAttempts: number;
  private is_compiling: boolean;
  private is_memo_definition: boolean;
  private cur_definition: DefinitionWord | null;
  private string_location?: CodeLocation;
  private word_counts: { [key: string]: number };
  private is_profiling: boolean;
  private start_profile_time: number | null;
  private timestamps: Timestamp[];
  private streaming_token_index: number = 0;
  private stream: boolean = false;
  private previous_delta_length: number = 0;
  private literal_handlers: LiteralHandler[];

  constructor(modules: Module[] = [], timezone: Temporal.TimeZoneLike = "UTC") {
    this.timezone = timezone;
    this.stack = new Stack(); // Use Stack class instead of []

    this.tokenizer_stack = [];
    this.maxAttempts = 3;
    this.handleError = undefined;

    this.app_module = new Module("");
    this.app_module.set_interp(this);
    this.module_stack = [this.app_module];
    this.registered_modules = {};
    this.is_compiling = false;
    this.is_memo_definition = false;
    this.cur_definition = null;

    // Debug support
    this.string_location = undefined;

    // Profiling support
    this.word_counts = {};
    this.is_profiling = false;
    this.start_profile_time = null;
    this.timestamps = [];

    // Literal handlers
    this.literal_handlers = [];
    this.register_standard_literals();

    // If modules are provided, import them unprefixed as a convenience
    this.import_modules(modules);
  }

  get_timezone(): Temporal.TimeZoneLike {
    return this.timezone;
  }

  set_timezone(timezone: Temporal.TimeZoneLike) {
    this.timezone = timezone;
  }

  // Phase 0: No halt() method (was for debug stepping)

  get_app_module(): Module {
    return this.app_module;
  }

  get_top_input_string(): string {
    if (this.tokenizer_stack.length == 0) return "";
    return this.tokenizer_stack[0].get_input_string();
  }

  get_tokenizer(): Tokenizer {
    return this.tokenizer_stack[this.tokenizer_stack.length - 1];
  }

  get_string_location(): CodeLocation | undefined {
    return this.string_location;
  }

  set_max_attempts(maxAttempts: number) {
    this.maxAttempts = maxAttempts;
  }

  set_error_handler(handleError: HandleErrorFunction) {
    this.handleError = handleError;
  }

  get_max_attempts(): number {
    return this.maxAttempts;
  }

  get_error_handler(): HandleErrorFunction | undefined {
    return this.handleError;
  }

  reset() {
    this.stack = new Stack(); // Phase 1: Use Stack class
    this.app_module.variables = {};

    this.module_stack = [this.app_module];
    this.is_compiling = false;
    this.is_memo_definition = false;
    this.cur_definition = null;

    // Debug support
    this.string_location = undefined;
  }


  async run(
    string: string,
    reference_location: CodeLocation | null = null,
  ): Promise<boolean | number> {
    this.tokenizer_stack.push(new Tokenizer(string, reference_location));

    if (this.handleError) {
      await this.execute_with_recovery();
    } else {
      await this.run_with_tokenizer(
        this.tokenizer_stack[this.tokenizer_stack.length - 1],
      );
    }

    this.tokenizer_stack.pop();
    return true;
  }

  async execute_with_recovery(numAttempts: number = 0): Promise<number> {
    try {
      numAttempts++;
      if (numAttempts > this.maxAttempts) {
        throw new TooManyAttemptsError(
          this.get_top_input_string(),
          numAttempts,
          this.maxAttempts,
        );
      }
      await this.continue();
      return numAttempts;
    } catch (e) {
      if (!this.handleError) throw e;
      await this.handleError(e, this);
      return await this.execute_with_recovery(numAttempts);
    }
  }

  async continue() {
    await this.run_with_tokenizer(
      this.tokenizer_stack[this.tokenizer_stack.length - 1],
    );
    return;
  }

  async run_with_tokenizer(tokenizer: Tokenizer): Promise<boolean> {
    // Collect word tokens first for batching optimization
    // We store tokens (not resolved Words) to defer word lookup until execution time.
    // This allows dynamically defined words (e.g., from LOAD) to be found.
    const wordTokens: Token[] = [];
    let token: Token;

    do {
      this.previous_token = token;
      token = tokenizer.next_token();

      // For word tokens, collect the token (defer word lookup until execution)
      if (token.type === TokenType.WORD && !this.is_compiling) {
        wordTokens.push(token);
      } else {
        // For non-word tokens, execute any collected words first, then handle the token
        if (wordTokens.length > 0) {
          await this.executeBatchedWordTokens(wordTokens);
          wordTokens.length = 0; // Clear the array
        }

        await this.handle_token(token);
      }

      if (token.type === TokenType.EOS) {
        // Execute any remaining words
        if (wordTokens.length > 0) {
          await this.executeBatchedWordTokens(wordTokens);
        }
        break;
      }
      // eslint-disable-next-line no-constant-condition
    } while (true);
    return true; // Done executing
  }

  /**
   * Execute a sequence of word tokens with deferred word lookup.
   * This resolves words at execution time (not parse time) to support
   * dynamically defined words (e.g., words defined by LOAD).
   *
   * Words are looked up and executed ONE AT A TIME to ensure that
   * words defined during execution (e.g., by LOAD) are available
   * for subsequent words in the same batch.
   */
  private async executeBatchedWordTokens(tokens: Token[]): Promise<void> {
    // Look up and execute each word one at a time
    // This ensures words defined during execution are available for later words
    for (const token of tokens) {
      const word = this.find_word(token.string);
      word.set_location(token.location);
      this.count_word(word);
      try {
        await word.execute(this);
      } catch (e) {
        // Don't wrap IntentionalStopError - it's a control-flow mechanism for debugging
        if (e instanceof IntentionalStopError) {
          throw e;
        }
        // Don't wrap ForthicError subclasses - they already have location context
        if (e instanceof ForthicError) {
          throw e;
        }
        // Wrap generic errors in WordExecutionError to add location context
        if (e instanceof Error) {
          throw new WordExecutionError(
            e.message,
            e,
            this.get_tokenizer()?.get_token_location(),
            word.get_location() || undefined
          );
        }
        throw e;
      }
    }
  }

  /**
   * Execute a sequence of words with batching optimization
   */
  private async executeBatchedWords(words: Word[]): Promise<void> {
    // Lazy import to avoid circular dependency
    const { ExecutionPlanner } = await import('./execution_planner.js');

    // Only import RuntimeManager in Node.js environment (not browser)
    // gRPC requires Node.js and won't work in browser
    const isBrowser = typeof window !== 'undefined';
    let RuntimeManager: any = null;

    if (!isBrowser) {
      const module = await import('../grpc/runtime_manager.js');
      RuntimeManager = module.RuntimeManager;
    }

    const planner = new ExecutionPlanner();
    const batches = planner.planExecution(words);
    const runtimeManager = RuntimeManager ? RuntimeManager.getInstance() : null;

    for (const batch of batches) {
      if (!batch.isRemote) {
        // Execute local words one by one
        for (const word of batch.words) {
          this.count_word(word);
          try {
            await word.execute(this);
          } catch (e) {
            // Don't wrap IntentionalStopError - it's a control-flow mechanism for debugging
            if (e instanceof IntentionalStopError) {
              throw e;
            }
            // Don't wrap ForthicError subclasses - they already have location context
            if (e instanceof ForthicError) {
              throw e;
            }
            // Wrap generic errors in WordExecutionError to add location context
            if (e instanceof Error) {
              throw new WordExecutionError(
                e.message,
                e,
                this.get_tokenizer()?.get_token_location(),
                word.get_location() || undefined
              );
            }
            throw e;
          }
        }
      } else {
        // Remote execution only works in Node.js environment
        if (!runtimeManager) {
          throw new Error(`Remote execution not available in browser environment. Runtime '${batch.runtime}' cannot be accessed.`);
        }

        // Batch execute remote words in one RPC call
        const client = runtimeManager.getClient(batch.runtime);

        if (!client) {
          throw new Error(`No gRPC client registered for runtime '${batch.runtime}'`);
        }

        // Count all words for profiling
        for (const word of batch.words) {
          this.count_word(word);
        }

        // Extract word names from the batch
        const wordNames = batch.words.map((w: Word) => w.name);

        // Get current stack state
        const stackItems = this.stack.get_items();

        // Execute the sequence remotely
        const resultStack = await client.executeSequence(wordNames, stackItems);

        // Clear local stack and replace with result
        while (this.stack.length > 0) {
          this.stack_pop();
        }

        // Push all result items
        for (const item of resultStack) {
          this.stack_push(item);
        }
      }
    }
  }

  cur_module(): Module {
    const result = this.module_stack[this.module_stack.length - 1];
    return result;
  }

  find_module(name: string): Module {
    const result = this.registered_modules[name];
    if (result === undefined) {
      throw new UnknownModuleError(
        this.get_top_input_string(),
        name,
        this.string_location,
      );
    }
    return result;
  }

  stack_peek(): any {
    const top = this.stack[this.stack.length - 1];
    let result = top;
    if (top instanceof PositionedString) {
      result = top.valueOf();
    }
    return result;
  }

  stack_push(val: any) {
    this.stack.push(val);
  }

  stack_pop(): any {
    if (this.stack.length == 0) {
      const tokenizer = this.tokenizer_stack.length > 0 ? this.get_tokenizer() : undefined;
      throw new StackUnderflowError(
        this.get_top_input_string(),
        tokenizer?.get_token_location(),
      );
    }
    let result = this.stack.pop();

    // If we have a PositionedString, we need to record the location
    this.string_location = undefined;
    if (result instanceof PositionedString) {
      const positioned_string = result;
      result = positioned_string.valueOf();
      this.string_location = positioned_string.location;
    }
    return result;
  }

  get_stack(): Stack {
    return this.stack;
  }

  set_stack(stack: Stack) {
    this.stack = stack;
  }

  module_stack_push(module: Module) {
    this.module_stack.push(module);
  }

  module_stack_pop(): Module {
    return this.module_stack.pop();
  }

  register_module(module: Module) {
    this.registered_modules[module.name] = module;
    module.set_interp(this);
  }

  // If names is an array of strings, import each module without a prefix (empty string)
  // If names is an array of arrays, import each module using the first element as the
  // module name and the second element as the prefix
  use_modules(names: any[], options: Record<string, any> = {}) {
    const prefixed = options.prefixed ?? false;
    for (const name of names) {
      let module_name = name;
      let prefix = "";  // Default to empty prefix (no prefix)
      if (name instanceof Array) {
        module_name = name[0];
        prefix = name[1];  // Allow explicit prefix specification
      } else if (prefixed) {
        prefix = name;  // Use module name as its own prefix
      }
      const module = this.find_module(module_name);
      this.get_app_module().import_module(prefix, module, this);
    }
  }

  // A convenience method to register and use a module
  import_module(module: Module, prefix = "") {
    this.register_module(module);
    this.use_modules([[module.name, prefix]]);
  }

  import_modules(modules: Module[]) {
    for (const module of modules) {
      this.import_module(module);
    }
  }

  // Transforms simple module names to unprefixed imports: "math" -> ["math", ""]
  // Preserves explicit prefix specifications: ["math", "m"] -> ["math", "m"]
  use_modules_unprefixed(names: any[]) {
    const unprefixed = names.map(name =>
      name instanceof Array ? name : [name, ""]
    );
    this.use_modules(unprefixed);
  }

  async run_module_code(module: Module): Promise<void> {
    this.module_stack_push(module);
    try {
      // Set source to module name when running module code
      const module_location = new CodeLocation({ source: module.name });
      await this.run(module.forthic_code, module_location);
    } catch (e) {
      throw new ModuleError(
        this.get_top_input_string(),
        module.name,
        e,
        this.string_location,
        e,
      );
    }

    this.module_stack_pop();
  }

  // ======================
  // Literal Handlers

  /**
   * Register standard literal handlers
   * Order matters: more specific handlers first
   */
  private register_standard_literals(): void {
    this.literal_handlers = [
      to_bool,                              // TRUE, FALSE
      to_float,                             // 3.14
      to_zoned_datetime(this.timezone),     // 2020-06-05T10:15:00Z
      to_literal_date(this.timezone),       // 2020-06-05, YYYY-MM-DD
      to_time,                              // 9:00, 11:30 PM
      to_int,                               // 42
    ];
  }

  /**
   * Register a custom literal handler
   * New handlers are added first so they can override existing ones
   */
  register_literal_handler(handler: LiteralHandler): void {
    this.literal_handlers.unshift(handler);
  }

  /**
   * Unregister a literal handler
   */
  unregister_literal_handler(handler: LiteralHandler): void {
    const index = this.literal_handlers.indexOf(handler);
    if (index > -1) {
      this.literal_handlers.splice(index, 1);
    }
  }

  /**
   * Try to parse string as a literal value
   * Returns PushValueWord if successful, null otherwise
   */
  find_literal_word(name: string): Word | null {
    for (const handler of this.literal_handlers) {
      const value = handler(name);
      if (value !== null) {
        return new PushValueWord(name, value);
      }
    }
    return null;
  }

  // ======================
  // Find Word

  find_word(name: string): Word {
    // 1. Check module stack (dictionary words + variables)
    let result = null;
    for (let i = this.module_stack.length - 1; i >= 0; i--) {
      const m = this.module_stack[i];
      result = m.find_word(name);
      if (result) break;
    }

    // 2. Check literal handlers as fallback
    if (!result) {
      result = this.find_literal_word(name);
    }

    // 3. Throw error if still not found
    if (!result) {
      throw new UnknownWordError(
        this.get_top_input_string(),
        name,
        this.get_string_location(),
      );
    }

    return result;
  }

  // ======================
  // Profiling
  start_profiling() {
    this.is_profiling = true;
    this.timestamps = [];
    this.start_profile_time = Date.now();
    this.add_timestamp("START");
    this.word_counts = {};
  }

  count_word(word: Word) {
    if (!this.is_profiling) return;
    const name = word.name;
    if (!this.word_counts[name]) this.word_counts[name] = 0;
    this.word_counts[name] += 1;
  }

  stop_profiling() {
    this.add_timestamp("END");
    this.is_profiling = false;
  }

  add_timestamp(label: string) {
    if (!this.is_profiling) return;
    const timestamp: Timestamp = {
      label: label,
      time_ms: Date.now() - this.start_profile_time,
    };
    this.timestamps.push(timestamp);
  }

  word_histogram(): any[] {
    const items = [];
    Object.keys(this.word_counts).forEach((name) => {
      items.push({ word: name, count: this.word_counts[name] });
    });
    const result = items.sort((l, r) => r["count"] - l["count"]);
    return result;
  }

  profile_timestamps(): Timestamp[] {
    return this.timestamps;
  }

  // ======================
  // Handle tokens

  async handle_token(token: Token) {
    if (token.type == TokenType.STRING) await this.handle_string_token(token);
    else if (token.type == TokenType.COMMENT) this.handle_comment_token(token);
    else if (token.type == TokenType.START_ARRAY)
      await this.handle_start_array_token(token);
    else if (token.type == TokenType.END_ARRAY)
      await this.handle_end_array_token(token);
    else if (token.type == TokenType.START_MODULE)
      await this.handle_start_module_token(token);
    else if (token.type == TokenType.END_MODULE)
      await this.handle_end_module_token(token);
    else if (token.type == TokenType.START_DEF)
      this.handle_start_definition_token(token);
    else if (token.type == TokenType.START_MEMO)
      this.handle_start_memo_token(token);
    else if (token.type == TokenType.END_DEF)
      this.handle_end_definition_token(token);
    else if (token.type == TokenType.DOT_SYMBOL) await this.handle_dot_symbol_token(token);
    else if (token.type == TokenType.WORD) await this.handle_word_token(token);
    else if (token.type == TokenType.EOS) {
      if (this.is_compiling) {
        throw new MissingSemicolonError(
          this.get_top_input_string(),
          this.previous_token?.location,
        );
      }
      return;
    } else {
      throw new UnknownTokenError(
        this.get_top_input_string(),
        token.string,
        this.string_location,
      );
    }
  }

  async handle_string_token(token: Token) {
    const value = new PositionedString(token.string, token.location);
    await this.handle_word(new PushValueWord("<string>", value));
  }

  async handle_dot_symbol_token(token: Token) {
    const value = new PositionedString(token.string, token.location);
    await this.handle_word(new PushValueWord("<dot-symbol>", value));
  }

  // Start/end module tokens are treated as IMMEDIATE words *and* are also compiled
  async handle_start_module_token(token: Token) {
    const self = this;
    const word = new StartModuleWord(token.string);

    if (self.is_compiling) self.cur_definition.add_word(word);
    self.count_word(word); // For profiling
    await word.execute(self);
  }

  async handle_end_module_token(_token: Token) {
    const self = this;
    const word = new EndModuleWord();

    if (self.is_compiling) self.cur_definition.add_word(word);
    self.count_word(word);
    await word.execute(self);
  }

  async handle_start_array_token(token: Token) {
    await this.handle_word(new PushValueWord("<start_array_token>", token));
  }

  async handle_end_array_token(_token: Token) {
    await this.handle_word(new EndArrayWord());
  }

  handle_comment_token(_token: Token) {
    // console.log("Comment:", token.string);
  }

  handle_start_definition_token(token: Token) {
    if (this.is_compiling) {
      throw new MissingSemicolonError(
        this.get_top_input_string(),
        this.previous_token?.location,
      );
    }
    this.cur_definition = new DefinitionWord(token.string);
    this.is_compiling = true;
    this.is_memo_definition = false;
  }

  handle_start_memo_token(token: Token) {
    if (this.is_compiling) {
      throw new MissingSemicolonError(
        this.get_top_input_string(),
        this.previous_token?.location,
      );
    }
    this.cur_definition = new DefinitionWord(token.string);
    this.is_compiling = true;
    this.is_memo_definition = true;
  }

  handle_end_definition_token(token: Token) {
    if (!this.is_compiling || !this.cur_definition) {
      throw new ExtraSemicolonError(
        this.get_top_input_string(),
        token.location,
      );
    }

    if (this.is_memo_definition) {
      this.cur_module().add_memo_words(this.cur_definition);
    } else {
      this.cur_module().add_word(this.cur_definition);
    }
    this.is_compiling = false;
  }

  async handle_word_token(token: Token) {
    const word = this.find_word(token.string); // Throws UnknownWordError if not found
    await this.handle_word(word, token.location);
  }

  async handle_word(word: Word, location: CodeLocation | null = null) {
    if (this.is_compiling) {
      word.set_location(location);
      this.cur_definition.add_word(word);
    } else {
      this.count_word(word);
      await word.execute(this);
    }
  }

  /**
   * Execute streaming Forthic code.
   *
   * @param fullCode - The complete Forthic code from the start up to the current point.
   * @param done - When false, execute tokens up to (but not including) the last one (if more than one token exists).
   *               When true, execute the final token as well.
   */

  async *streamingRun(
    codeStream: string,
    done: boolean,
    reference_location: CodeLocation | null = null,
  ) {
    // Create a new Tokenizer for the full string.
    const tokenizer = new Tokenizer(codeStream, reference_location, done ? false : true);
    const tokens: Token[] = [];
    let eosFound = false;

    this.tokenizer_stack.push(tokenizer);

    // Gather tokens from the beginning.
    while (true) {
      const token = tokenizer.next_token();
      if (!token) {
        break;
      }

      // If we hit an EOS token then push it and break.
      if (token.type === TokenType.EOS) {
        tokens.push(token);
        eosFound = true;
        break;
      }

      tokens.push(token);
    }

    const delta = eosFound ? undefined : tokenizer.get_string_delta();

    let newStop = findLastWordOrEOS(tokens);

    if (eosFound && !done) {
      newStop--;
    }
    if (!eosFound && !done) {
      newStop++;
    }

    // Execute only tokens we have not executed previously.
    for (let i = this.streaming_token_index; i < newStop; i++) {
      const token = tokens[i];
      if (!token) {
        continue;
      }

      await this.handle_token(token);

      if (
        this.stream &&
        (token.type !== TokenType.WORD || token.string !== "START-LOG")
      ) {
        yield token.string;
      }
      this.previous_token = token;
    }

    // Done with this tokenizer
    this.tokenizer_stack.pop();

    if (this.stream && !eosFound) {
      // Yield string delta if we're streaming and tokenizer has a delta
      const newPortion = delta.substring(this.previous_delta_length);

      if (newPortion) {
        yield { stringDelta: newPortion };
      }
      this.previous_delta_length = delta.length;
    }

    if (done) {
      this.endStream();
      return;
    }

    // Update our pointer and reset if done
    this.streaming_token_index = newStop;
  }

  startStream() {
    this.stream = true;
    this.previous_delta_length = 0;
    this.streaming_token_index = 0;
  }

  endStream() {
    this.stream = false;
    this.previous_delta_length = 0;
    this.streaming_token_index = 0;
  }
}

function findLastWordOrEOS(tokens: Token[]): number {
  return tokens.findLastIndex(
    (token) => token.type === TokenType.WORD || token.type === TokenType.EOS,
  );
}

// This interface exposes private fields needed for duplication
interface InterpreterInternal {
  app_module: Module;
  module_stack: Module[];
  stack: Stack;
  registered_modules: { [key: string]: Module };
  handleError?: HandleErrorFunction;
}

export function dup_interpreter(interp: Interpreter): Interpreter {
  const source = interp as unknown as InterpreterInternal;
  // Create new interpreter of the same type as the source
  const constructor = Object.getPrototypeOf(interp).constructor;
  const result_interp = new constructor([], interp.get_timezone());
  const target = result_interp as unknown as InterpreterInternal;

  // Use copy() instead of dup() to preserve module_prefixes
  target.app_module = source.app_module.copy(result_interp);
  target.module_stack = [target.app_module];

  // Use Stack.dup() method
  target.stack = source.stack.dup();

  // Share registered modules reference (modules are shared, not copied)
  target.registered_modules = source.registered_modules;

  // Copy error handler if present
  if (source.handleError) {
    target.handleError = source.handleError;
  }

  return result_interp;
}

/**
 * Interpreter - Full-featured interpreter with standard library
 *
 * Extends Interpreter and automatically imports standard modules:
 * - CoreModule: Stack operations, variables, module system, control flow
 * - ArrayModule: Array/collection operations
 * - RecordModule: Record/object operations
 * - StringModule: String operations
 * - MathModule: Mathematical operations
 * - BooleanModule: Boolean/comparison operations
 * - JsonModule: JSON parsing/serialization
 * - DateTimeModule: Date and time operations
 *
 * For most use cases, use this class. Use Interpreter if you need
 * full control over which modules are loaded.
 */
export class StandardInterpreter extends Interpreter {
  constructor(modules: Module[] = [], timezone: Temporal.TimeZoneLike = "UTC") {
    // Don't pass modules to super - we'll import them after stdlib
    super([], timezone);

    // Import standard library synchronously
    this.import_standard_library();

    // Import additional modules
    this.import_modules(modules);
  }

  private import_standard_library() {
    // Load standard library modules synchronously
    const stdlib = [
      new CoreModule(),
      new ArrayModule(),
      new RecordModule(),
      new StringModule(),
      new MathModule(),
      new BooleanModule(),
      new JsonModule(),
      new DateTimeModule(),
    ];

    // Import unprefixed at the BOTTOM of module stack
    // This ensures they're checked LAST during find_word()
    for (const module of stdlib) {
      this.import_module(module, "");
    }
  }
}
