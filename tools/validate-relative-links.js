/**
 * Relative Link Validator
 *
 * Validates relative links (./file.md, ../dir/file.md) in markdown files.
 * Designed to work with links that function across:
 * - Local IDEs (clicking links in VS Code, Cursor, etc.)
 * - Astro/Starlight documentation sites
 * - GitHub repository browsing
 *
 * What it checks:
 * - All relative links point to existing .md files
 * - Anchor links (#section) point to valid headings
 *
 * What it fixes (with --write):
 * - Broken links where the target file can be found by filename
 * - Skips ambiguous cases (e.g., multiple index.md files)
 *
 * Usage:
 *   node tools/validate-relative-links.js                    # Validate all docs
 *   node tools/validate-relative-links.js docs/test          # Validate specific directory
 *   node tools/validate-relative-links.js --write            # Fix auto-fixable issues
 *   node tools/validate-relative-links.js docs/test --write  # Fix in specific directory
 *   node tools/validate-relative-links.js --json             # Output as JSON
 */

const fs = require('node:fs');
const path = require('node:path');

// Parse arguments
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const writeMode = args.includes('--write');
const filteredArg = args.find((a) => !a.startsWith('--'));
const targetDir = filteredArg ? path.resolve(filteredArg) : path.resolve(__dirname, '../docs');

// Regex to match markdown links with relative paths
// Matches: [text](./path) or [text](../path) but not [text](/absolute) or [text](http://...)
const RELATIVE_LINK_REGEX = /\[([^\]]*)\]\((\.\.?\/[^)]+)\)/g;

// File extensions that are static assets, not markdown docs
const STATIC_ASSET_EXTENSIONS = ['.zip', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

// Regex to extract headings for anchor validation
const HEADING_PATTERN = /^#{1,6}\s+(.+)$/gm;

// Cache for file index (filename -> array of full paths)
let fileIndex = null;

/**
 * Get all markdown files in directory, excluding _* directories/files
 */
function getMarkdownFiles(dir) {
  const files = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.name.startsWith('_') || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Build an index of files by filename for quick lookups
 */
function buildFileIndex(files) {
  const index = new Map();

  for (const file of files) {
    const filename = path.basename(file);
    if (!index.has(filename)) {
      index.set(filename, []);
    }
    index.get(filename).push(file);
  }

  return index;
}

/**
 * Find files matching a filename
 */
function findFilesByName(filename) {
  if (!fileIndex) return [];
  return fileIndex.get(filename) || [];
}

/**
 * Calculate relative path from source file to target file
 */
function calculateRelativePath(sourceFile, targetFile) {
  const sourceDir = path.dirname(sourceFile);
  let relativePath = path.relative(sourceDir, targetFile);

  // Ensure it starts with ./ or ../
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  // Normalize to forward slashes
  relativePath = relativePath.split(path.sep).join('/');

  return relativePath;
}

/**
 * Strip fenced code blocks from content
 */
function stripCodeBlocks(content) {
  return content.replaceAll(/```[\s\S]*?```/g, '');
}

/**
 * Convert a heading to its anchor slug
 */
function headingToAnchor(heading) {
  return heading
    .toLowerCase()
    .replaceAll(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replaceAll(/[^\w\s-]/g, '') // Remove special chars
    .replaceAll(/\s+/g, '-') // Spaces to hyphens
    .replaceAll(/-+/g, '-') // Collapse hyphens
    .replaceAll(/^-+|-+$/g, ''); // Trim hyphens
}

/**
 * Extract anchor slugs from a markdown file
 */
function extractAnchors(content) {
  const anchors = new Set();
  let match;

  HEADING_PATTERN.lastIndex = 0;
  while ((match = HEADING_PATTERN.exec(content)) !== null) {
    const headingText = match[1]
      .trim()
      .replaceAll(/`[^`]+`/g, '')
      .replaceAll(/\*\*([^*]+)\*\*/g, '$1')
      .replaceAll(/\*([^*]+)\*/g, '$1')
      .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    anchors.add(headingToAnchor(headingText));
  }

  return anchors;
}

/**
 * Resolve a relative link from a source file to its target path
 */
function resolveRelativeLink(sourceFile, relativePath) {
  const sourceDir = path.dirname(sourceFile);

  // Strip anchor and query
  let linkPath = relativePath.split('#')[0].split('?')[0];

  // Resolve the relative path
  const resolved = path.resolve(sourceDir, linkPath);

  return resolved;
}

/**
 * Check if a file exists, trying various extensions/index patterns
 */
function findTarget(resolvedPath) {
  // Direct match
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return resolvedPath;
  }

  // Try with .md extension if not present
  if (!resolvedPath.endsWith('.md')) {
    const withMd = resolvedPath + '.md';
    if (fs.existsSync(withMd) && fs.statSync(withMd).isFile()) {
      return withMd;
    }
  }

  // If it's a directory path (ends with /), look for index.md
  if (resolvedPath.endsWith('/')) {
    const indexPath = path.join(resolvedPath, 'index.md');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  // If path doesn't end with .md, check if it's a directory with index.md
  if (!resolvedPath.endsWith('.md')) {
    const asDir = resolvedPath;
    if (fs.existsSync(asDir) && fs.statSync(asDir).isDirectory()) {
      const indexPath = path.join(asDir, 'index.md');
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

/**
 * Try to find a fix for a broken link
 */
function findFix(sourceFile, brokenHref) {
  // Extract filename from the broken path
  const hashIndex = brokenHref.indexOf('#');
  const linkPath = hashIndex === -1 ? brokenHref : brokenHref.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? '' : brokenHref.slice(hashIndex);

  // Get the target filename
  let targetFilename = path.basename(linkPath);

  // If no extension, assume .md
  if (!targetFilename.endsWith('.md')) {
    targetFilename += '.md';
  }

  // Search for files with this name
  const candidates = findFilesByName(targetFilename);

  if (candidates.length === 0) {
    return { status: 'not-found', message: 'File not found anywhere' };
  }

  if (candidates.length === 1) {
    const newPath = calculateRelativePath(sourceFile, candidates[0]);
    return {
      status: 'auto-fixable',
      suggestedFix: newPath + anchor,
      foundAt: path.relative(targetDir, candidates[0]),
    };
  }

  // Multiple candidates - ambiguous
  return {
    status: 'ambiguous',
    message: `Multiple files named "${targetFilename}"`,
    candidates: candidates.map((c) => path.relative(targetDir, c)),
  };
}

/**
 * Process a single file and find issues
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const strippedContent = stripCodeBlocks(content);
  const issues = [];

  let match;
  RELATIVE_LINK_REGEX.lastIndex = 0;

  while ((match = RELATIVE_LINK_REGEX.exec(strippedContent)) !== null) {
    const linkText = match[1];
    const href = match[2];

    // Extract path and anchor
    const hashIndex = href.indexOf('#');
    const linkPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? null : href.slice(hashIndex + 1);

    // Skip static asset links
    const linkLower = linkPath.toLowerCase();
    if (STATIC_ASSET_EXTENSIONS.some((ext) => linkLower.endsWith(ext))) {
      continue;
    }

    // Resolve the relative path
    const resolvedPath = resolveRelativeLink(filePath, linkPath);
    const targetFile = findTarget(resolvedPath);

    if (!targetFile) {
      const fix = findFix(filePath, href);
      issues.push({
        type: 'broken-link',
        linkText,
        href,
        linkPath,
        resolvedTo: resolvedPath,
        line: getLineNumber(content, match[0]),
        fullMatch: match[0],
        ...fix,
      });
      continue;
    }

    // Validate anchor if present
    if (anchor) {
      const targetContent = fs.readFileSync(targetFile, 'utf-8');
      const anchors = extractAnchors(targetContent);

      if (!anchors.has(anchor)) {
        issues.push({
          type: 'broken-anchor',
          linkText,
          href,
          anchor,
          targetFile: path.relative(targetDir, targetFile),
          line: getLineNumber(content, match[0]),
          availableAnchors: [...anchors].slice(0, 5),
          status: 'manual',
        });
      }
    }
  }

  return { content, issues };
}

/**
 * Apply fixes to file content
 */
function applyFixes(content, issues) {
  let updated = content;

  for (const issue of issues) {
    if (issue.status === 'auto-fixable' && issue.suggestedFix) {
      const oldLink = `[${issue.linkText}](${issue.href})`;
      const newLink = `[${issue.linkText}](${issue.suggestedFix})`;
      updated = updated.replace(oldLink, newLink);
    }
  }

  return updated;
}

/**
 * Get line number where a match occurs
 */
function getLineNumber(content, matchText) {
  const index = content.indexOf(matchText);
  if (index === -1) return null;
  return content.slice(0, index).split('\n').length;
}

/**
 * Format output for console
 */
function formatConsoleOutput(results) {
  const { files, totalIssues, autoFixable, ambiguous, notFound, brokenAnchors, fileIssues, fixesApplied } = results;

  console.log(`\nValidating relative links in: ${targetDir}`);
  console.log(`Mode: ${writeMode ? 'WRITE (applying fixes)' : 'DRY RUN (use --write to fix)'}`);
  console.log(`Found ${files} markdown files\n`);

  if (fileIssues.length === 0) {
    console.log('All relative links are valid!\n');
    return;
  }

  for (const { file, issues } of fileIssues) {
    console.log(`\n${file}`);

    for (const issue of issues) {
      if (issue.type === 'broken-link') {
        if (issue.status === 'auto-fixable') {
          console.log(`  Line ${issue.line || '?'}: [FIX] ${issue.href}`);
          console.log(`     -> ${issue.suggestedFix}`);
        } else if (issue.status === 'ambiguous') {
          console.log(`  Line ${issue.line || '?'}: [AMBIGUOUS] ${issue.href}`);
          console.log(`     ${issue.message}:`);
          for (const candidate of issue.candidates) {
            console.log(`       - ${candidate}`);
          }
        } else {
          console.log(`  Line ${issue.line || '?'}: [MANUAL] ${issue.href}`);
          console.log(`     ${issue.message}`);
        }
      } else if (issue.type === 'broken-anchor') {
        console.log(`  Line ${issue.line || '?'}: [ANCHOR] ${issue.href}`);
        console.log(`     Anchor "#${issue.anchor}" not found in ${issue.targetFile}`);
        if (issue.availableAnchors && issue.availableAnchors.length > 0) {
          console.log(`     Available: ${issue.availableAnchors.join(', ')}`);
        }
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\nSummary:`);
  console.log(`   Files scanned: ${files}`);
  console.log(`   Files with issues: ${fileIssues.length}`);
  console.log(`   Total issues: ${totalIssues}`);
  console.log(`\n   Breakdown:`);
  console.log(`     Auto-fixable:   ${autoFixable}`);
  console.log(`     Ambiguous:      ${ambiguous}`);
  console.log(`     Not found:      ${notFound}`);
  console.log(`     Broken anchors: ${brokenAnchors}`);

  if (writeMode && fixesApplied > 0) {
    console.log(`\n   Fixed ${fixesApplied} issue(s)`);
  } else if (!writeMode && autoFixable > 0) {
    console.log(`\nRun with --write to auto-fix ${autoFixable} issue(s)`);
  }

  console.log('');
}

// Main execution
function main() {
  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const files = getMarkdownFiles(targetDir);

  // Build file index for lookups
  fileIndex = buildFileIndex(files);

  const fileIssues = [];
  let totalIssues = 0;
  let autoFixable = 0;
  let ambiguous = 0;
  let notFound = 0;
  let brokenAnchors = 0;
  let fixesApplied = 0;

  for (const filePath of files) {
    const relativePath = path.relative(targetDir, filePath);
    const { content, issues } = processFile(filePath);

    if (issues.length > 0) {
      fileIssues.push({ file: relativePath, issues });
      totalIssues += issues.length;

      for (const issue of issues) {
        if (issue.type === 'broken-link') {
          if (issue.status === 'auto-fixable') autoFixable++;
          else if (issue.status === 'ambiguous') ambiguous++;
          else notFound++;
        }
        if (issue.type === 'broken-anchor') brokenAnchors++;
      }

      // Apply fixes if in write mode
      if (writeMode) {
        const fixableIssues = issues.filter((i) => i.status === 'auto-fixable');
        if (fixableIssues.length > 0) {
          const updated = applyFixes(content, fixableIssues);
          fs.writeFileSync(filePath, updated, 'utf-8');
          fixesApplied += fixableIssues.length;
        }
      }
    }
  }

  const results = {
    targetDir,
    files: files.length,
    totalIssues,
    autoFixable,
    ambiguous,
    notFound,
    brokenAnchors,
    fixesApplied,
    fileIssues,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    formatConsoleOutput(results);
  }

  // Exit with error if there are unfixed issues
  const remainingIssues = writeMode ? ambiguous + notFound + brokenAnchors : totalIssues;
  process.exit(remainingIssues > 0 ? 1 : 0);
}

main();
