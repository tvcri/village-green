---
name: empirical-dependency-analysis
description: Verify dependencies empirically through comprehensive codebase analysis before proposing any code artifact changes
---

# Empirical Dependency Analysis

When analyzing code artifacts to determine if they are used, unused, or have specific dependencies, apply rigorous empirical verification. Never conclude based on partial searches, logical inference, or assumptions.

## When to Use

Invoke this skill when:
- Identifying which files/functions/schemas are orphaned or unused
- Calculating which items depend on a removed artifact
- Determining if something is "only referenced by X"
- Tracing dependency chains or impact analysis
- Proposing what can be safely removed (the analysis that precedes removal)
- Any intermediate step that requires understanding what uses what

## Core Process

### 1. Define the Analysis Target
- Name the artifact(s) to analyze
- Clarify what you're determining: "Is X used?" or "What depends on X?" or "What becomes orphaned if X is removed?"
- Identify the scope: entire codebase, specific directory, multiple filetypes

### 2. Perform Comprehensive Search
Search the **entire relevant codebase** for all references:

**For a file:**
```
grep -r "filename\|require.*filename\|import.*filename" /path/to/codebase --include="*.js" --include="*.ts" --include="*.yaml" --include="*.json" --include="*.py" [etc for all relevant extensions]
```

**For a function/method:**
```
grep -r "functionName\s*(" /path/to/codebase --include="*.js" --include="*.ts" [etc]
```

**For a schema/property:**
```
grep -r "propertyName\|'propertyName'\|\"propertyName\"" /path/to/codebase --include="*.yaml" --include="*.js" --include="*.ts" [etc]
```

**For an endpoint:**
```
grep -r "/endpoint\|endpoint.*path" /path/to/codebase --include="*.yaml" --include="*.js" --include="*.ts" [etc]
```

**Search strategy:**
- Do NOT limit searches to "likely" directories
- Search the entire codebase from root
- Include all relevant file extensions
- Use patterns that catch multiple naming conventions (camelCase, snake_case, quoted strings, etc.)
- Run separate searches for variations of the name

### 3. Display Evidence
Show all search results exactly as found:
- Paste the complete grep output
- Include file paths, line numbers, and context
- Do not filter, summarize, or aggregate—show everything
- If results are extensive, organize them by file but show all matches

### 4. Analyze Results Systematically

**If analyzing "Is X used?":**
- Zero results = X is unused (empirically verified)
- Any results = list all references, X is used
- Each reference found = potential blocker to removal

**If analyzing "What depends on X?":**
- List each file/artifact that references X
- For each reference, explain the dependency chain if relevant
- Identify whether references are direct (import X) or indirect (use something that uses X)

**If analyzing "What becomes orphaned if X is removed?":**
- Identify all artifacts that reference X
- For each artifact, search whether it's referenced elsewhere
- Only mark as orphaned if it has no other references
- Repeat transitively: if A only references B and B is removed, check if A itself has other references

### 5. Report Findings

Structure the analysis report:
1. **Search queries used** - what you searched for and where
2. **Results found** - complete evidence
3. **Analysis** - interpretation of the evidence
4. **Conclusion** - "X is used/unused/has N references" based on empirical data

**Never conclude:**
- "Probably unused" (assume thoroughness instead)
- "Should only be referenced here" (verify instead)
- "Logically must be used by X" (search instead)

## Key Rules

- **Comprehensive before conclusive.** Search everywhere before concluding.
- **Show your work.** Display search results and evidence before analysis.
- **Search the entire codebase.** Not likely directories—all directories.
- **Include all file types.** Not just code—specs, configs, tests, migrations, docs.
- **Verify patterns catch variations.** If searching for `collectionGrants`, also search `collection_grants`, `'collectionGrants'`, `"collectionGrants"`, etc.
- **One artifact at a time.** Analyze dependencies for each item independently.
- **If results seem incomplete, search again.** Different patterns, different directories, different extensions.
- **Document your search strategy.** State what you searched for and why, so reasoning is auditable.

## Example: Incorrect (Assumption-Based)

**User:** "Is writer.js used?"

**Without skill:**
- Search: grep for "writer" in controllers/ and service/
- Results: empty
- Conclusion: "writer.js is orphaned, propose removal"
- **Problem:** Didn't search bootstrap/, missed actual usage

## Example: Correct (Empirical)

**User:** "Is writer.js used?"

**With skill:**
1. **Search query:** `grep -r "writer" /home/csmig/dev/village-green/api/source --include="*.js"`
2. **Results:**
   ```
   /home/csmig/dev/village-green/api/source/bootstrap/client.js:3: const writer = require('../utils/writer')
   /home/csmig/dev/village-green/api/source/bootstrap/client.js:45: writer.setupClient(app)
   ```
3. **Analysis:** writer.js is actively used by bootstrap/client.js in 2 places
4. **Conclusion:** writer.js is used, cannot be removed

---

**Remember:** Exhaustive search first. Evidence always. Conclusion only after verification.
