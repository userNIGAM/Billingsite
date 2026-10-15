import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend', 'package.json'));
const ts = require('typescript');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const graphExtensions = new Set([...sourceExtensions, '.css', '.scss', '.json']);
const ignoredDirectories = new Set(['node_modules', '.next', 'dist', 'coverage']);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, files);
    } else if (
      graphExtensions.has(path.extname(entry.name)) &&
      entry.name !== 'next-env.d.ts' &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(absolutePath);
    }
  }
  return files;
}

function relativePath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined;

  const basePath = specifier.startsWith('@/') ?
    path.join(root, 'frontend', specifier.slice(2)) :
    path.resolve(path.dirname(importer), specifier);
  const candidates = [basePath];

  for (const extension of graphExtensions) {
    candidates.push(`${basePath}${extension}`);
  }
  for (const extension of graphExtensions) {
    candidates.push(path.join(basePath, `index${extension}`));
  }

  const match = candidates.find((candidate) => {
    if (!fs.existsSync(candidate)) return false;
    return fs.statSync(candidate).isFile();
  });
  return match && relativePath(match);
}

function moduleReferences(sourceFile) {
  const references = [];

  function add(specifier, kind, node) {
    if (ts.isStringLiteralLike(specifier)) {
      references.push({
        specifier: specifier.text,
        kind,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, 'import', node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node.moduleSpecifier, 're-export', node);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node.arguments[0], 'dynamic-import', node);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        add(node.arguments[0], 'require', node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function classify(file) {
  const [rootName, directory = 'root'] = file.split('/');
  const fileName = path.basename(file);
  let layer = directory;

  if (rootName === 'frontend' && directory === 'app') layer = 'routes';
  if (rootName === 'backend' && fileName === 'app.ts') layer = 'composition';
  if (rootName === 'backend' && fileName === 'server.ts') layer = 'entrypoint';

  return {
    id: file,
    application: rootName,
    layer,
    extension: path.extname(file).slice(1),
  };
}

const files = ['backend', 'frontend'].flatMap((directory) => walk(path.join(root, directory)));
const nodeIds = new Set(files.map(relativePath));
const nodes = [...nodeIds].sort().map(classify);
const edges = [];
const unresolvedLocalImports = [];

for (const absolutePath of files) {
  if (!sourceExtensions.has(path.extname(absolutePath))) continue;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const extension = path.extname(absolutePath);
  const scriptKind = extension === '.tsx' || extension === '.jsx'
    ? ts.ScriptKind.TSX
    : ['.js', '.mjs', '.cjs'].includes(extension)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absolutePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  for (const reference of moduleReferences(sourceFile)) {
    if (!reference.specifier.startsWith('.') && !reference.specifier.startsWith('@/')) continue;

    const target = resolveLocalImport(absolutePath, reference.specifier);
    if (!target || !nodeIds.has(target)) {
      unresolvedLocalImports.push({
        from: relativePath(absolutePath),
        specifier: reference.specifier,
        line: reference.line,
      });
      continue;
    }
    edges.push({
      from: relativePath(absolutePath),
      to: target,
      kind: reference.kind,
      line: reference.line,
    });
  }
}

edges.sort((left, right) =>
  left.from.localeCompare(right.from) ||
  left.to.localeCompare(right.to) ||
  left.kind.localeCompare(right.kind) ||
  left.line - right.line
);
unresolvedLocalImports.sort((left, right) =>
  left.from.localeCompare(right.from) || left.line - right.line
);

const graph = {
  formatVersion: 1,
  description: 'Local source-module dependency graph for the Canteen Khata backend and frontend.',
  generatedBy: 'node scripts/graphify.mjs',
  scope: ['backend/', 'frontend/'],
  exclusions: ['node_modules/', '.next/', 'dist/', 'coverage/', '*.d.ts'],
  stats: {
    nodes: nodes.length,
    edges: edges.length,
    unresolvedLocalImports: unresolvedLocalImports.length,
  },
  nodes,
  edges,
  unresolvedLocalImports,
};

const outputPath = path.join(root, 'docs', 'codebase-graph.json');
fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(
  `Wrote ${relativePath(outputPath)} ` +
  `(${nodes.length} nodes, ${edges.length} edges, ` +
  `${unresolvedLocalImports.length} unresolved local imports).`
);
