# Forthic — Standard Words

Generated: 2026-08-14T15:41:57.461Z

**8 modules · 165 surface words**

Classic/back-compat words live in `classic/classic_module.ts` and are
intentionally omitted from this index.

---

## array

Array and collection operations for manipulating arrays and records.

### Access

- **NTH** `( container:any n:number -- item:any )` — Get nth element from array or record
- **FIRST** `( container:any -- item:any )` — Get first element from array or record (insertion order for records)
- **LAST** `( container:any -- item:any )` — Get last element from array or record
- **SLICE** `( container:any start:number end:number -- result:any )` — Extract slice from array or record
- **TAKE** `( container:any n:number [options:WordOptions] -- result:any )` — Take first n elements (record in -> record out, insertion order)
- **TAKE-LAST** `( container:any n:number -- result:any )` — Take last n elements from array or record (insertion order for records).
- **SKIP** `( container:any n:number -- result:any )` — Skip first n elements from array or record
- **LENGTH** `( container:any -- length:number )` — Length of an array or record. For strings, use STR-LENGTH.
- **INDEX** `( items:any[] forthic:string -- indexed:any )` — Create index mapping from array indices to values
- **KEY-OF** `( container:any value:any -- key:any )` — Find key of value in container

### Transform

- **MAP** `( items:any forthic:string [options:WordOptions] -- mapped:any )` — Map function over items. Options: with_key (bool), depth (num), interps (num), outcomes (bool). With outcomes, each element maps to {ok: value} or {error: {message, error_type}} — per-element failures don't abort and can't disturb the stack (MAP restores its own pushes). Example: [1 2 3] '2 *' [.outcomes TRUE] ~> MAP
- **MAP-AT** `( container:any key:any|any[] forthic:string -- container:any )` — Apply forthic to the value at key/index, returning a new container with that slot transformed. The key arg may be a single key (one-level update) or a path-array for deep updates. Polymorphic over arrays and records. Equivalent of jq's |= operator.
- **REVERSE** `( container:any -- container:any )` — Reverse array

### Combine

- **APPEND** `( array:any[] item:any -- array:any[] )` — Append item to array. For records, use JQ! to set a key.
- **ZIP** `( container1:any[] container2:any[] -- result:any[] )` — Zip two arrays into array of pairs
- **ZIP-WITH** `( container1:any[] container2:any[] forthic:string -- result:any[] )` — Zip two arrays with combining function

### Filter

- **FILTER** `( container:any forthic:string [options:WordOptions] -- filtered:any )` — Filter items with predicate. Options: with_key (bool)
- **UNIQUE** `( array:any[] -- array:any[] )` — Remove duplicates from array
- **UNIQUE-BY** `( items:any[] forthic:string -- items:any[] )` — Dedupe items by the key forthic produces (keeps first occurrence).
- **DIFFERENCE** `( lcontainer:any rcontainer:any -- result:any )` — Set difference between two containers
- **INTERSECTION** `( lcontainer:any rcontainer:any -- result:any )` — Set intersection between two containers
- **UNION** `( lcontainer:any rcontainer:any -- result:any )` — Set union between two containers

### Sort

- **SORT** _(declared in category but not found in module)_
- **SORT-BY** `( items:any[] forthic:string -- sorted:any[] )` — Sort items by the value forthic produces (ascending).
- **SORT-U** `( strings:any[] -- strings:any[] )` — Sort an array and remove duplicates (bash sort -u).

### Search

- **FIND** `( items:any forthic:string -- item:any )` — Return the first item where forthic returns truthy, or null if none.
- **COUNT** `( items:any forthic:string -- n:number )` — Count items where forthic returns truthy.

### Extrema

- **MIN-BY** `( items:any[] forthic:string -- item:any )` — Return the item with the smallest value produced by forthic. Null on empty input.
- **MAX-BY** `( items:any[] forthic:string -- item:any )` — Return the item with the largest value produced by forthic. Null on empty input.

### Indexing

- **NUMBERED** `( items:any[] -- pairs:any[] )` — Pair each item with its index: [v0 v1 v2] -> [[0 v0] [1 v1] [2 v2]]. (Python's enumerate.)

### Group

- **BY-FIELD** `( container:any[] field:string -- indexed:any )` — Index records by field value
- **GROUP-BY** `( items:any forthic:string [options:WordOptions] -- grouped:any )` — Group items by function result. Options: with_key (bool). Example: [5 15 25] '10 /' [.with_key TRUE] ~> GROUP-BY
- **GROUP-BY-FIELD** `( container:any[] field:string -- grouped:any )` — Group records by field value
- **GROUPS-OF** `( container:any[] n:number -- groups:any[] )` — Split array into groups of size n

### Iteration

- **FOREACH** _(declared in category but not found in module)_
- **REDUCE** `( container:any initial:any forthic:string -- result:any )` — Reduce array or record with accumulator
- **UNPACK** `( container:any -- elements:any )` — Unpack array or record elements onto stack
- **FLATTEN** `( container:any [options:WordOptions] -- flat:any )` — Flatten nested arrays or records. Options: depth (number). Example: [[[1 2]]] [.depth 1] ~> FLATTEN
- **TIMES-RUN** `( num_times:number forthic:string -- )` — Run forthic num_times. Each invocation runs in the current stack — no automatic per-iteration value passing.

## boolean

Comparison, logic, and membership operations for boolean values and conditions.

### Comparison

- **==** `( a:any b:any -- equal:boolean )` — Test equality
- **!=** `( a:any b:any -- not_equal:boolean )` — Test inequality
- **<** `( a:any b:any -- less_than:boolean )` — Less than
- **<=** `( a:any b:any -- less_equal:boolean )` — Less than or equal
- **>** `( a:any b:any -- greater_than:boolean )` — Greater than
- **>=** `( a:any b:any -- greater_equal:boolean )` — Greater than or equal

### Logic

- **OR** `( a:boolean b:boolean -- result:boolean )` — Logical OR of two values. For arrays use ANY?.
- **AND** `( a:boolean b:boolean -- result:boolean )` — Logical AND of two values. For arrays use ALL?.
- **NOT** `( bool:boolean -- result:boolean )` — Logical NOT
- **ANY?** `( bools:boolean[] -- result:boolean )` — Returns true if any element of the array is truthy. False for empty array.
- **ALL?** `( bools:boolean[] -- result:boolean )` — Returns true if all elements of the array are truthy. True for empty array.

### Membership

- **CONTAINS?** `( haystack:any[] needle:any -- bool:boolean )` — Check if haystack array contains needle. Container-first arg order.

### Conversion

- **>BOOL** `( a:any -- bool:boolean )` — Convert to boolean (JavaScript truthiness)

### Other

- **ALL** `( items1:any[] items2:any[] -- all:boolean )` — Check if all items from items2 are in items1
- **ANY** `( items1:any[] items2:any[] -- any:boolean )` — Check if any item from items1 is in items2

## core

Essential interpreter operations for stack manipulation, variables, control flow, and module system.

### Stack

- **DROP** `( a:any -- )` — Removes top item from stack
- **DUP** `( a:any -- a:any a:any )` — Duplicates top stack item
- **SWAP** `( a:any b:any -- b:any a:any )` — Swaps top two stack items

### Variables

- **VARIABLES** `( varnames:string[] -- )` — Creates variables in current module
- **!** `( value:any variable:any -- )` — Sets variable value (auto-creates if string name)
- **@** `( variable:any -- value:any )` — Gets variable value (throws UnknownVariableError if string name is undeclared)
- **!@** `( value:any variable:any -- value:any )` — Sets variable and returns value

### Module

- **USE-MODULES** `( names:string[] [options:WordOptions] -- )` — Imports modules by name

### Execution

- **RUN** `( forthic:string -- ? )` — Run a Forthic string in the current context. Whatever the forthic produces is left on the stack.

### Control

- **NOP** `( -- )` — Does nothing (no operation)
- **DEFAULT** `( value:any default_value:any -- result:any )` — Returns value or default if value is null/undefined/empty string
- **DEFAULT-RUN** `( value:any forthic:string -- result:any )` — Lazy default: returns value if non-empty, otherwise runs forthic and uses its result. The forthic is only evaluated when needed.
- **NULL** `( -- null:null )` — Pushes null onto stack
- **UNDEFINED** _(declared in category but not found in module)_
- **IF** `( bool:boolean then_value:any else_value:any -- chosen:any )` — Pure value selection: push then_value if bool is truthy, else push else_value. For lazy code execution use IF-RUN; for one-sided side effects use WHEN.
- **IF-RUN** `( bool:boolean then_forthic:string else_forthic:string -- ? )` — Conditional code execution: if bool is truthy run then_forthic, otherwise run else_forthic. Branches are Forthic strings.
- **WHEN** `( bool:boolean forthic:string -- ? )` — If bool is truthy run forthic, otherwise do nothing. The forthic argument is always treated as code (executed in current context).

### Predicates

- **ARRAY?** `( value:any -- boolean:boolean )` — Returns true if value is an array
- **NULL?** `( value:any -- boolean:boolean )` — Returns true if value is null or undefined
- **EMPTY?** `( value:any -- boolean:boolean )` — Returns true if value is null/undefined, an empty string, or a container (array/record) with no entries
- **STRING?** `( value:any -- boolean:boolean )` — Returns true if value is a string
- **NUMBER?** `( value:any -- boolean:boolean )` — Returns true if value is a number (Infinity is a number; NaN is not)
- **RECORD?** `( value:any -- boolean:boolean )` — Returns true if value is a plain record (object that is not an array and not null)

### Errors

- **TRY** _(declared in category but not found in module)_
- **OK?** `( outcome:record -- boolean:boolean )` — True if outcome is an ok record (structural: has an 'ok' key)
- **ERROR?** `( outcome:record -- boolean:boolean )` — True if outcome is an error record (structural: has an 'error' key)
- **UNWRAP** `( outcome:record -- value:any )` — Extract the ok value from a TRY outcome; re-raises for an error outcome (preserving message and error_type). 'CODE' TRY UNWRAP ≡ CODE.
- **UNWRAP-OR (Rust Result semantics: 'CODE' TRY UNWRAP is CODE)** _(declared in category but not found in module)_

### Options

- **~> (converts array to WordOptions)** _(declared in category but not found in module)_

### String

- **INTERPOLATE** `( string:string [options:WordOptions] -- result:string )` — Fill ${name} holes from variables (${.name} also works; read-only — a miss renders as null_text and creates nothing). Holes are variable names, never expressions. Escape a literal with \\${. Null template stays null.
- **PRINT** `( value:any [options:WordOptions] -- )` — Print value to stdout. Strings interpolate ${name} holes first; other values format with the same options. Escape a literal with \\${.

### Debug

- **PEEK!** `( -- )` — Prints top of stack and stops execution
- **STACK!** `( -- )` — Prints entire stack (reversed) and stops execution

### Other

- **~>** `( array:any[] -- options:WordOptions )` — Convert options array to WordOptions. Format: [.key1 val1 .key2 val2]
- **UNWRAP-OR** `( outcome:record default:any -- value:any )` — Extract the ok value from a TRY outcome, or default if it is an error outcome

## datetime

Date and time operations using the Temporal API for timezone-aware datetime manipulation.

### Current

- **TODAY** `( -- date:Temporal.PlainDate )` — Get current date
- **NOW** `( -- datetime:Temporal.ZonedDateTime )` — Get current datetime

### Time adjustment

- **AM** `( time:Temporal.PlainTime -- time:Temporal.PlainTime )` — Convert time to AM (subtract 12 from hour if >= 12)
- **PM** `( time:Temporal.PlainTime -- time:Temporal.PlainTime )` — Convert time to PM (add 12 to hour if < 12)

### Conversion to

- **>TIME** `( item:any -- time:Temporal.PlainTime )` — Convert string or datetime to PlainTime
- **>DATE** `( item:any -- date:Temporal.PlainDate )` — Convert string or datetime to PlainDate
- **>DATETIME** `( str_or_timestamp:any -- datetime:Temporal.ZonedDateTime )` — Convert string or timestamp to ZonedDateTime
- **AT** `( date:Temporal.PlainDate time:Temporal.PlainTime -- datetime:Temporal.ZonedDateTime )` — Combine date and time into datetime

### Conversion from

- **TIME>STR** `( time:Temporal.PlainTime -- str:string )` — Convert time to HH:MM string
- **DATE>STR** `( date:Temporal.PlainDate -- str:string )` — Convert date to YYYY-MM-DD string

### Getters

- **YEAR** `( date:Temporal.PlainDate -- year:number )` — Get the calendar year of a date.
- **MONTH** `( date:Temporal.PlainDate -- month:number )` — Get the calendar month of a date (1=January, 12=December).
- **DAY-OF-WEEK** `( date:Temporal.PlainDate -- day:number )` — Get the day-of-week (1=Monday, 7=Sunday, ISO 8601).

### Timestamps

- **>TIMESTAMP** `( datetime:Temporal.ZonedDateTime -- timestamp:number )` — Convert datetime to Unix timestamp (seconds)
- **TIMESTAMP>DATETIME** `( timestamp:number -- datetime:Temporal.ZonedDateTime )` — Convert Unix timestamp (seconds) to datetime

### Date math

- **ADD-DAYS** `( date:Temporal.PlainDate num_days:number -- date:Temporal.PlainDate )` — Add days to a date
- **DAYS-BETWEEN** `( date1:Temporal.PlainDate date2:Temporal.PlainDate -- num_days:number )` — Get number of days between two dates (date1 - date2)

## json

JSON serialization, parsing, and formatting operations.

### Conversion

- **>JSON** `( object:any -- json:string )` — Convert object to JSON string
- **JSON>** `( json:string -- object:any )` — Parse JSON string to object

## math

Mathematical operations and utilities including arithmetic, aggregation, and conversions.

### Arithmetic

- **+** `( a:number b:number -- sum:number )` — Add two numbers. For arrays use SUM.
- **-** `( a:number b:number -- difference:number )` — Subtract b from a
- ***** `( a:number b:number -- product:number )` — Multiply two numbers. For arrays use PRODUCT.
- **/** `( a:number b:number -- quotient:number )` — Divide a by b
- **MOD** `( m:number n:number -- remainder:number )` — Modulo operation (m % n)
- **RANGE** `( start:number end:number -- numbers:number[] )` — Generate inclusive integer range from start to end (e.g. 1 5 RANGE -> [1,2,3,4,5]). Empty if start > end.

### Aggregates

- **MEAN** `( items:any[] -- mean:any )` — Calculate mean of array (handles numbers, strings, objects)
- **MAX** `( numbers:number[] -- max:number )` — Maximum of an array of numbers. Null/undefined elements are skipped. Returns null for empty/all-null array.
- **MIN** `( numbers:number[] -- min:number )` — Minimum of an array of numbers. Null/undefined elements are skipped. Returns null for empty/all-null array.
- **SUM** `( numbers:number[] -- sum:number )` — Sum of array (explicit)
- **PRODUCT** `( numbers:number[] -- product:number )` — Product of array of numbers (1 if empty). Null/undefined elements yield null.

### Type conversion

- **>INT** `( a:any -- int:number )` — Convert to integer (returns length for arrays/objects, 0 for null)
- **>FLOAT** `( a:any -- float:number )` — Convert to float
- **FORMAT-FIXED** `( num:number digits:number -- result:string )` — Format number with fixed decimal places
- **ROUND** `( num:number -- int:number )` — Round to nearest integer

### Math functions

- **ABS** `( n:number -- abs:number )` — Absolute value
- **SQRT** `( n:number -- sqrt:number )` — Square root
- **FLOOR** `( n:number -- floor:number )` — Round down to integer
- **CEIL** `( n:number -- ceil:number )` — Round up to integer
- **CLAMP** `( value:number min:number max:number -- clamped:number )` — Constrain value to range [min, max]

## record

Record (object/dictionary) manipulation operations for working with key-value data structures.

### Core

- **REC** `( key_vals:any[] -- rec:any )` — Create record from [[key, val], ...] pairs
- **REC@** `( rec:any field:any -- value:any )` — Get value from record by field or array of fields
- **<REC!** `( rec:any value:any field:any -- rec:any )` — Set value in record at field path

### Path access (jq-style)

- **JQ@** `( container:any path:any -- value:any )` — Get value at jq-style path (e.g., .users[].name). Returns null on miss; [] iterates and flattens. Path arrays accepted for dynamic keys.
- **JQ!** `( container:any value:any path:any -- container:any )` — Set value at jq-style path. Auto-creates missing intermediates (record for field, array for index). [] iteration not supported.
- **JQ-DEL (use "[].field" JQ@ to map a field over an array of records)** _(declared in category but not found in module)_

### Construct

- **ENTRIES>REC** `( pairs:any[] -- rec:any )` — Build a record from an array of [key, value] pairs. Alias of REC, surfaced for symmetry with REC>ENTRIES.

### Disassemble

- **REC>ENTRIES** `( rec:any -- pairs:any[] )` — Convert a record to an array of [key, value] pairs in insertion order, making the ENTRIES>REC round trip an identity. Inverse of ENTRIES>REC / REC.

### Combine

- **MERGE** `( rec1:any rec2:any -- merged:any )` — Shallow merge two records. Keys present in rec2 override rec1.

### Subset

- **PICK** `( rec:any keys:any[] -- rec:any )` — Return a new record containing only the listed keys (missing keys are skipped).
- **OMIT** `( rec:any keys:any[] -- rec:any )` — Return a new record without the listed keys.

### Predicate

- **HAS-KEY?** `( rec:any key:any -- bool:boolean )` — Returns true if rec has the given key (own property). Distinct from REC@ NULL == — handles intentional null values correctly.

### Transform

- **DELETE** `( container:any key:any -- container:any )` — Delete key from record or index from array

### Access

- **KEYS** `( container:any -- keys:any[] )` — Get keys from record or indices from array
- **VALUES** `( container:any -- values:any[] )` — Get values from record or elements from array

### Other

- **JQ-DEL** `( container:any path:any -- container:any )` — Delete value at jq-style path. No-op if path doesn't exist. [] iteration not supported.

## string

String manipulation and processing operations with regex and URL encoding support.

### Conversion

- **>STR** `( item:any -- string:string )` — Convert item to string. Records render as JSON; arrays comma-join their stringified elements.

### Transform

- **LOWERCASE** `( string:string -- result:string )` — Convert string to lowercase
- **UPPERCASE** `( string:string -- result:string )` — Convert string to uppercase
- **STRIP** `( string:string -- result:string )` — Trim whitespace from string
- **ASCII** `( string:string -- result:string )` — Keep only ASCII characters (< 256)
- **TRIM-PREFIX** `( str:string prefix:string -- result:string )` — Strip prefix from start of str if present (otherwise return str unchanged).
- **TRIM-SUFFIX** `( str:string suffix:string -- result:string )` — Strip suffix from end of str if present (otherwise return str unchanged).

### Split/Join

- **SPLIT** `( string:string sep:string -- items:any[] )` — Split string by separator
- **JOIN** `( strings:string[] sep:string -- result:string )` — Join strings with separator
- **CONCAT** `( strings:string[] -- result:string )` — Concatenate an array of strings into one string. For two strings: write [s1 s2] CONCAT. For arrays of arrays, use FLATTEN.
- **LINES** `( str:string -- lines:string[] )` — Split string on newline. Equivalent to /N SPLIT.
- **UNLINES** `( lines:string[] -- str:string )` — Join an array of lines with newlines. Equivalent to /N JOIN.

### Pattern

- **REPLACE** `( string:string text:string replace:string -- result:string )` — Replace all literal occurrences of text with replace. For regex matching use RE-REPLACE.
- **RE-REPLACE** `( string:string pattern:string replace:string -- result:string )` — Replace all regex matches of pattern with replace. Same as classic REPLACE behavior.
- **RE-MATCH** `( string:string pattern:string -- match:any )` — Match string against regex pattern
- **RE-MATCH-ALL** `( string:string pattern:string -- matches:any[] )` — Find all regex matches in string
- **RE-MATCH?** `( str:string pattern:string -- bool:boolean )` — Returns true if str matches the regex pattern. Predicate-only — does not return the match. (jq's `test`.)

### Predicates

- **STARTS-WITH?** `( str:string prefix:string -- bool:boolean )` — Returns true if str begins with prefix.
- **ENDS-WITH?** `( str:string suffix:string -- bool:boolean )` — Returns true if str ends with suffix.
- **RE-MATCH?** `( str:string pattern:string -- bool:boolean )` — Returns true if str matches the regex pattern. Predicate-only — does not return the match. (jq's `test`.)

### Bash-flavored

- **GREP** `( strings:string[] pattern:string -- matches:string[] )` — Keep only strings matching the regex pattern (bash grep).
- **GREP-V** `( strings:string[] pattern:string -- non_matches:string[] )` — Keep only strings NOT matching the regex pattern (bash grep -v).
- **SED** `( strings:string[] pattern:string repl:string -- strings:string[] )` — Apply RE-REPLACE to each string in the array (bash sed s/pattern/repl/g).
- **CUT** `( strings:string[] sep:string field:number -- field_values:any[] )` — Split each string on sep and pick the field-th column (bash cut). Out-of-range yields null.

### Constants

- **/N** `( -- char:string )` — Newline character
- **/T** `( -- char:string )` — Tab character

### Other

- **SPLICE** `( str:string start:number end:number newval:string -- result:string )` — Replace the substring [start, end) of str with newval and return the result (a splice).
- **STR-LENGTH** `( str:string -- length:number )` — Length of a string in characters (0 if null/undefined).
- **SUBSTR** `( str:string start:number end:number -- substring:string )` — Substring of str from start (inclusive) to end (exclusive), by character index. Indices clamp like String.slice (negatives count from the end).

