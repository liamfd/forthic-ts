#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

/**
 * Documentation Generator for Forthic Modules
 *
 * Generates markdown documentation by parsing TypeScript source files
 * and extracting metadata from @ForthicWord and @ForthicDirectWord decorators.
 */

interface WordDoc {
  name: string;
  stackEffect: string;
  description: string;
}

interface ModuleDoc {
  name: string;
  words: WordDoc[];
  metadata?: {
    description: string;
    categories: Array<{ name: string; words: string }>;
    optionsInfo?: string;
    examples: string[];
  } | null;
}

/**
 * Parse module documentation from registerModuleDoc call
 */
function parseModuleMetadata(content: string): ModuleDoc['metadata'] | null {
  const registerMatch = content.match(/registerModuleDoc\([^,]+,\s*`([^`]+)`\)/s);
  if (!registerMatch) return null;

  const docString = registerMatch[1];
  const lines = docString.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const metadata: NonNullable<ModuleDoc['metadata']> = {
    description: '',
    categories: [],
    optionsInfo: undefined,
    examples: []
  };

  let currentSection: 'description' | 'categories' | 'options' | 'examples' = 'description';
  let optionsLines: string[] = [];

  for (const line of lines) {
    // Check for section headers
    if (line.startsWith('## Categories')) {
      currentSection = 'categories';
      continue;
    } else if (line.startsWith('## Options')) {
      currentSection = 'options';
      continue;
    } else if (line.startsWith('## Examples')) {
      currentSection = 'examples';
      continue;
    }

    // Process content based on current section
    if (currentSection === 'description') {
      if (metadata.description) {
        metadata.description += ' ' + line;
      } else {
        metadata.description = line;
      }
    } else if (currentSection === 'categories') {
      // Parse "- Category Name: WORD1, WORD2, WORD3"
      const match = line.match(/^-\s*([^:]+):\s*(.+)$/);
      if (match) {
        metadata.categories.push({
          name: match[1].trim(),
          words: match[2].trim()
        });
      }
    } else if (currentSection === 'options') {
      optionsLines.push(line);
    } else if (currentSection === 'examples') {
      metadata.examples.push(line);
    }
  }

  // Join options lines into a single string
  if (optionsLines.length > 0) {
    metadata.optionsInfo = optionsLines.join('\n');
  }

  return metadata;
}

/**
 * Parse @ForthicWord and @ForthicDirectWord decorators from TypeScript source
 */
function parseWords(content: string): WordDoc[] {
  const words: WordDoc[] = [];

  // Match @ForthicWord and @ForthicDirectWord decorators (also supports legacy @Word/@DirectWord).
  // The trailing `,?` after each arg group allows multi-line decorators that end with a
  // trailing comma after the last arg (Prettier's default style).
  const wordRegex = /@(?:ForthicWord|ForthicDirectWord|Word|DirectWord)\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*(?:,\s*"([^"]+)"\s*,?)?\s*,?\s*\)/g;
  let match;

  while ((match = wordRegex.exec(content)) !== null) {
    const stackEffect = match[1];
    const description = match[2];
    const customName = match[3];

    // Find the method name by looking ahead. Match either:
    //   async NAME(...)              — plain identifier
    //   async ["NAME"](...)          — bracketed string-literal name (used
    //                                   for word names with non-identifier
    //                                   chars like ARRAY?, MAP-AT, REC@, etc.)
    const afterDecorator = content.substring(match.index + match[0].length);
    const methodMatch = afterDecorator.match(
      /async\s+(?:\[\s*["']([^"']+)["']\s*\]|(\w+))\s*\(/,
    );

    if (methodMatch) {
      const methodName = methodMatch[1] || methodMatch[2];
      const wordName = customName || methodName;

      words.push({
        name: wordName,
        stackEffect: stackEffect,
        description: description,
      });
    }
  }

  return words;
}

/**
 * Extract module name from class definition
 */
function parseModuleName(content: string): string | null {
  const classMatch = content.match(/export\s+class\s+(\w+Module)/);
  if (!classMatch) return null;

  // Look for super("modulename") call in constructor
  const constructorMatch = content.match(/constructor\s*\([^)]*\)\s*\{[^}]*super\s*\(\s*"([^"]+)"\s*\)/s);
  if (constructorMatch) {
    return constructorMatch[1];
  }

  // Fallback: derive from class name
  const className = classMatch[1];
  return className.replace(/Module$/, '').toLowerCase();
}

/**
 * Parse a single module file
 */
function parseModuleFile(filePath: string): ModuleDoc | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const moduleName = parseModuleName(content);

  if (!moduleName) {
    console.warn(`Could not extract module name from ${filePath}`);
    return null;
  }

  const words = parseWords(content);
  const metadata = parseModuleMetadata(content);

  return {
    name: moduleName,
    words: words.sort((a, b) => a.name.localeCompare(b.name)),
    metadata: metadata
  };
}

function generateIndexMarkdown(moduleDocs: ModuleDoc[]): string {
  let markdown = '# Forthic Module Documentation\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;

  const totalWords = moduleDocs.reduce((sum, mod) => sum + mod.words.length, 0);
  markdown += `**${moduleDocs.length} modules** with **${totalWords} words** total\n\n`;

  markdown += '## Modules\n\n';
  markdown += '| Module | Words | Description |\n';
  markdown += '|--------|-------|-------------|\n';

  for (const mod of moduleDocs) {
    markdown += `| [${mod.name}](./modules/${mod.name}.md) | ${mod.words.length} | `;

    // Use metadata description if available, otherwise use defaults
    if (mod.metadata?.description) {
      markdown += mod.metadata.description;
    } else {
      const descriptions: Record<string, string> = {
        'array': 'Array and collection operations',
        'boolean': 'Comparison, logic, and membership operations',
        'datetime': 'Date and time operations using Temporal API',
        'json': 'JSON parsing and serialization',
        'math': 'Mathematical operations and utilities',
        'record': 'Record (object/dictionary) manipulation',
        'string': 'String manipulation and processing'
      };
      markdown += descriptions[mod.name] || 'Module operations';
    }
    markdown += ' |\n';
  }

  markdown += '\n## Quick Links\n\n';
  for (const mod of moduleDocs) {
    markdown += `- **[${mod.name}](./modules/${mod.name}.md)**: ${mod.words.map(w => w.name).slice(0, 5).join(', ')}`;
    if (mod.words.length > 5) {
      markdown += `, ... (${mod.words.length - 5} more)`;
    }
    markdown += '\n';
  }

  return markdown;
}

function generateModuleMarkdown(moduleDoc: ModuleDoc): string {
  let markdown = `# ${moduleDoc.name} Module\n\n`;
  markdown += `[← Back to Index](../index.md)\n\n`;

  // Add module description if available
  if (moduleDoc.metadata?.description) {
    markdown += `${moduleDoc.metadata.description}\n\n`;
  }

  markdown += `**${moduleDoc.words.length} words**\n\n`;

  // Add categories section if available
  if (moduleDoc.metadata?.categories && moduleDoc.metadata.categories.length > 0) {
    markdown += '## Categories\n\n';
    for (const cat of moduleDoc.metadata.categories) {
      markdown += `- **${cat.name}**: ${cat.words}\n`;
    }
    markdown += '\n';
  }

  // Add options section if available
  if (moduleDoc.metadata?.optionsInfo) {
    markdown += '## Options\n\n';
    markdown += `${moduleDoc.metadata.optionsInfo}\n\n`;
  }

  // Add examples section if available
  if (moduleDoc.metadata?.examples && moduleDoc.metadata.examples.length > 0) {
    markdown += '## Examples\n\n';
    markdown += '```forthic\n';
    for (const example of moduleDoc.metadata.examples) {
      markdown += `${example}\n`;
    }
    markdown += '```\n\n';
  }

  markdown += '## Words\n\n';

  for (const word of moduleDoc.words) {
    markdown += `### ${word.name}\n\n`;
    markdown += `**Stack Effect:** \`${word.stackEffect}\`\n\n`;
    if (word.description) {
      markdown += `${word.description}\n\n`;
    }
    markdown += '---\n\n';
  }

  markdown += `\n[← Back to Index](../index.md)\n`;

  return markdown;
}

function findModuleFiles(dir: string, opts: { excludeClassic?: boolean } = {}): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // The classic/ subdirectory holds back-compat words that are
      // intentionally excluded from LLM-targeted documentation.
      if (opts.excludeClassic && entry.name === 'classic') continue;
      files.push(...findModuleFiles(fullPath, opts));
    } else if (entry.name.endsWith('_module.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Cross-module words index. Lists every documented word in standard/
 * (excluding classic/) grouped by source module → declared category.
 * This is the canonical "what words exist on the surface" reference.
 */
function generateWordsMarkdown(moduleDocs: ModuleDoc[]): string {
  let markdown = '# Forthic — Standard Words\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;

  const totalWords = moduleDocs.reduce((sum, mod) => sum + mod.words.length, 0);
  markdown += `**${moduleDocs.length} modules · ${totalWords} surface words**\n\n`;
  markdown += `Classic/back-compat words live in \`classic/classic_module.ts\` and are\n`;
  markdown += `intentionally omitted from this index.\n\n`;
  markdown += '---\n\n';

  for (const mod of moduleDocs) {
    markdown += `## ${mod.name}\n\n`;

    if (mod.metadata?.description) {
      markdown += `${mod.metadata.description}\n\n`;
    }

    const wordByName = new Map(mod.words.map((w) => [w.name, w]));
    const declaredInCategories = new Set<string>();

    if (mod.metadata?.categories && mod.metadata.categories.length > 0) {
      for (const cat of mod.metadata.categories) {
        const wordNames = cat.words.split(',').map((w) => w.trim()).filter((w) => w.length > 0);
        if (wordNames.length === 0) continue;

        markdown += `### ${cat.name}\n\n`;
        for (const wname of wordNames) {
          declaredInCategories.add(wname);
          const w = wordByName.get(wname);
          if (w) {
            markdown += `- **${w.name}** \`${w.stackEffect}\` — ${w.description}\n`;
          } else {
            markdown += `- **${wname}** _(declared in category but not found in module)_\n`;
          }
        }
        markdown += '\n';
      }
    }

    // Words present in the module but not listed under any declared category.
    const undeclared = mod.words.filter((w) => !declaredInCategories.has(w.name));
    if (undeclared.length > 0) {
      markdown += `### Other\n\n`;
      for (const w of undeclared) {
        markdown += `- **${w.name}** \`${w.stackEffect}\` — ${w.description}\n`;
      }
      markdown += '\n';
    }
  }

  return markdown;
}

/**
 * LLM system-prompt artifact for generating Forthic code. Has two parts:
 *
 *   1. A handwritten guidance header — language overview, syntax conventions,
 *      generation patterns, and rules. This text is the file's "voice"; tune
 *      it here when teaching a new pattern.
 *
 *   2. An auto-generated word list, grouped by module, derived from the
 *      @ForthicWord decorators. This is what changes when the surface gains
 *      or loses words.
 */
function generateLLMPrompt(moduleDocs: ModuleDoc[]): string {
  let markdown = '';

  // ----- Handwritten guidance header -----
  markdown += `You are a Forthic code generator. Given a user message, generate Forthic code
that handles the request.

## Forthic Language

Forthic is a stack-based language where operations consume values from a stack
and push results back. Stack effects are written \`( inputs -- outputs )\`.
Top of stack is rightmost. Forthic is postfix: arguments precede the word.

### Strings

- \`'foo'\` and \`"foo"\` — regular strings
- \`'''…'''\` — prose and multi-line content
- \`"""…"""\` — embedded Forthic code
- \`""\` — empty string (\`''''\` is not empty)

Every non-raw form interprets \`\\n \\t \\r \\0 \\\\ \\" \\'\`. Other backslash pairs
remain literal, so \`'''\\d+\\w*'''\` preserves the regex while \`'''a\\nb'''\`
contains a newline.

Escapes are processed before the closing delimiter. For example,
\`'''today\\'s plan'''\` contains an apostrophe. An unescaped delimiter still
closes the string: \`'''today'''s plan'''\` ends after \`today\`. Prefer a delimiter
that avoids escaping, such as \`"""today's plan"""\` or \`'''He said "hi"'''\`.

Prefix any form with \`r\` to disable escape processing: \`r'…'\`, \`r"…"\`,
\`r'''…'''\`, or \`r"""…"""\`. Use raw strings when backslashes must remain
unchanged, especially for:

- JSON: \`r'''{"msg": "line1\\nline2"}''' JSON>\`
- Forthic passed to \`RUN\`, \`MAP\`, \`FILTER\`, or \`WHEN\`: \`r"""'a\\nb'""" RUN\`
- Paths containing recognized escapes: \`r'C:\\temp'\` (plain \`'C:\\temp'\` contains a tab)

A raw string cannot contain its own delimiter. Switch delimiters or use the
triple-quoted form; for example, write \`r"don't"\` or \`r'''don't'''\` instead of
\`r'don't'\`.

### Arrays and Records

- Array: \`[ '''item1''' '''item2''' ]\`
- Record: \`[ [ .key '''value''' ] ] REC\`
- Field access: \`[.key] REC@\` (single key) or \`[.a .b] REC@\` (nested path)
- Deep transform: \`rec [.a .b] '''10 *''' MAP-AT\` (equivalent to jq's \`.a.b |= ...\`)
- JSON parse/stringify: \`JSON>\` and \`>JSON\`. Example: \`r'''{"a":1}''' JSON> [.a] REC@\` → \`1\`

### Common Operations

- \`RUN\` executes a Forthic string in the current context
- \`MAP\`: \`[ items ] """WORD_NAME""" MAP\` — apply a word to each item; collect into array
- \`FILTER\`: \`[ items ] """PREDICATE""" FILTER\` — keep items where predicate is truthy
- \`CONCAT\` joins an array of STRINGS into one string:
  - \`[ '''a''' '''b''' '''c''' ] CONCAT\` → \`'''abc'''\`
- \`FLATTEN\` — NOT \`CONCAT\` — merges arrays of arrays:
  - \`[ [1 2] [3 4] ] FLATTEN\` → \`[1 2 3 4]\`
  - (\`CONCAT\` would stringify them: \`'''1,23,4'''\`)
- \`JOIN\` joins strings with a separator: \`[ '''a''' '''b''' ] /N JOIN\` → string with newline between
- \`/N\` pushes a newline character; \`/T\` pushes a tab
- ALWAYS use the array form for \`CONCAT\` — never use binary \`CONCAT\` with two bare values
- \`IF\` selects between values: \`bool then-val else-val IF\`
- \`IF-RUN\` runs one of two Forthic strings: \`bool """then""" """else""" IF-RUN\`
- \`WHEN\` runs Forthic only if true: \`bool """code""" WHEN\`

### Word Definitions

Define named words to decompose tasks into steps:

\`\`\`
: WORD_NAME body words here ;            \\ regular word (composition of others)
@: MEMO_NAME body words here ;           \\ memo word (runs once, caches; refresh with MEMO_NAME!)
\`\`\`

### Variables

Variables store and recall values within word definitions:

- \`.name !\` (store)
- \`.name @\` (recall — ALWAYS store before recalling; \`@\` on a name that was
  never stored or declared is an error, not a null)
- \`.name !@\` (store and recall — keeps value on stack)

Use variables inside word definitions for intermediate values. Use them inline
in the composition line for cross-turn persistence.

## Generation Pattern

ALWAYS generate code in this structure:

1. Define a word for EACH domain step — even trivial ones. Every domain
   operation gets a word.
2. Each word definition gets a stack effect comment and a purpose comment:
   \`\`\`
   # ( inputs -- outputs )
   # What this step does
   : WORD_NAME ... ;
   \`\`\`
3. Use descriptive, task-specific names: \`ADD_MARCUS_AND_ENG_TEAM\` not \`ADD_RECIPIENTS\`.
4. Compose all defined words into a final comment + line at the end.
5. Use variables (\`.name !\` / \`.name @\`) inline in the composition line for plumbing —
   NOT wrapped in word definitions.

## Rules

- Only use valid Forthic words listed in the Words section below (or the
  Defined Words section if one is provided in the calling context).
- ALWAYS use the word-definition pattern for domain operations — never generate
  flat sequences of built-in words.
- If a word in the listing already does what you need, use it directly — do
  NOT redefine it.
- Variable storage (\`.name !\` / \`.name @\`) is inline plumbing, not a domain
  operation — do NOT wrap it in a word definition.
- Prefer the SIMPLEST composition — do NOT build classification / filtering /
  counting logic by hand when a built-in word does it.
- Never use \`SWAP\` or \`DUP\` — use variables instead to avoid stack-juggling errors.
- Generate ONLY the Forthic code, nothing else.

`;

  // ----- Auto-generated word list -----
  const totalWords = moduleDocs.reduce((sum, mod) => sum + mod.words.length, 0);
  markdown += `## Words\n\n`;
  markdown += `${moduleDocs.length} modules · ${totalWords} surface words.\n\n`;

  for (const mod of moduleDocs) {
    markdown += `### ${mod.name}\n`;
    for (const w of mod.words) {
      const desc = w.description || '';
      markdown += `- \`${w.name}\` \`${w.stackEffect}\`${desc ? ' — ' + desc : ''}\n`;
    }
    markdown += '\n';
  }

  return markdown;
}

async function generateDocs(opts: { rootDir?: string; excludeClassic?: boolean } = {}) {
  const moduleDocs: ModuleDoc[] = [];

  const rootDir = opts.rootDir ?? path.join(__dirname, '..', 'src', 'forthic', 'modules');
  const files = findModuleFiles(rootDir, opts);

  console.log(`Scanning ${rootDir}: ${files.length} module files`);

  // Parse each module file
  for (const filePath of files) {
    const moduleDoc = parseModuleFile(filePath);
    if (moduleDoc && moduleDoc.words.length > 0) {
      moduleDocs.push(moduleDoc);
      console.log(`  Parsed ${moduleDoc.name}: ${moduleDoc.words.length} words`);
    }
  }

  // Sort modules by name
  moduleDocs.sort((a, b) => a.name.localeCompare(b.name));

  return moduleDocs;
}

async function main() {
  try {
    console.log('Generating Forthic module documentation...');

    // Per-module docs include every module under modules/, classic too.
    const allModuleDocs = await generateDocs();

    // Surfaced-only docs: scoped to standard/ and exclude classic. This
    // is what the small-LLM prompt should see.
    const standardDir = path.join(__dirname, '..', 'src', 'forthic', 'modules', 'standard');
    const surfaceModuleDocs = await generateDocs({
      rootDir: standardDir,
      excludeClassic: true,
    });

    // Ensure docs directories exist
    const docsDir = path.join(__dirname, '..', 'docs');
    const modulesDir = path.join(docsDir, 'modules');
    if (!fs.existsSync(modulesDir)) {
      fs.mkdirSync(modulesDir, { recursive: true });
    }

    // Generate and write index file (all modules, including classic)
    const indexMarkdown = generateIndexMarkdown(allModuleDocs);
    const indexPath = path.join(docsDir, 'index.md');
    fs.writeFileSync(indexPath, indexMarkdown, 'utf-8');
    console.log(`✓ Index generated: ${indexPath}`);

    // Generate and write individual module files (all modules)
    let totalSize = indexMarkdown.length;
    for (const moduleDoc of allModuleDocs) {
      const moduleMarkdown = generateModuleMarkdown(moduleDoc);
      const modulePath = path.join(modulesDir, `${moduleDoc.name}.md`);
      fs.writeFileSync(modulePath, moduleMarkdown, 'utf-8');
      totalSize += moduleMarkdown.length;
      console.log(`  ✓ ${moduleDoc.name}.md (${moduleDoc.words.length} words)`);
    }

    // Cross-module surface words index (excludes classic)
    const wordsMarkdown = generateWordsMarkdown(surfaceModuleDocs);
    const wordsPath = path.join(docsDir, 'WORDS.md');
    fs.writeFileSync(wordsPath, wordsMarkdown, 'utf-8');
    totalSize += wordsMarkdown.length;
    console.log(`✓ WORDS.md generated: ${wordsPath}`);

    // Compact LLM-prompt artifact (excludes classic)
    const promptMarkdown = generateLLMPrompt(surfaceModuleDocs);
    const promptPath = path.join(docsDir, 'forthic-prompt.md');
    fs.writeFileSync(promptPath, promptMarkdown, 'utf-8');
    totalSize += promptMarkdown.length;
    console.log(`✓ forthic-prompt.md generated: ${promptPath}`);

    console.log(`\n✓ Documentation complete!`);
    console.log(`  Total files: ${allModuleDocs.length + 3}`);
    console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

main();
