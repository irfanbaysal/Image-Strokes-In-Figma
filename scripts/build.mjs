import { watch } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const mainEntry = path.join(srcDir, 'main.ts');
const uiEntry = path.join(srcDir, 'ui', 'main.ts');
const uiTemplatePath = path.join(srcDir, 'ui', 'index.html');
const uiDir = path.join(srcDir, 'ui');

const STYLES_PLACEHOLDER = '<!--STYLES-->';
const SCRIPT_PLACEHOLDER = '<!--SCRIPT-->';

function replacePlaceholder(html, placeholder, replacement) {
  if (!html.includes(placeholder)) {
    throw new Error(`Placeholder ${placeholder} is missing from src/ui/index.html`);
  }
  return html.replace(placeholder, () => replacement);
}

async function buildOnce() {
  const cssFiles = (await readdir(uiDir))
    .filter((name) => name.endsWith('.css'))
    .sort((a, b) => (a === 'styles.css' ? -1 : b === 'styles.css' ? 1 : a.localeCompare(b)));
  const [template, ...styleParts] = await Promise.all([
    readFile(uiTemplatePath, 'utf8'),
    ...cssFiles.map((name) => readFile(path.join(uiDir, name), 'utf8')),
  ]);
  const styles = styleParts.join('\n');
  for (const placeholder of [STYLES_PLACEHOLDER, SCRIPT_PLACEHOLDER]) {
    if (!template.includes(placeholder)) {
      throw new Error(`Placeholder ${placeholder} is missing from src/ui/index.html`);
    }
  }

  await mkdir(distDir, { recursive: true });

  const [, uiResult] = await Promise.all([
    build({
      entryPoints: [mainEntry],
      bundle: true,
      format: 'iife',
      target: 'es2017',
      outfile: path.join(distDir, 'main.js'),
      logLevel: 'silent',
    }),
    build({
      entryPoints: [uiEntry],
      bundle: true,
      format: 'iife',
      target: 'es2020',
      minify: true,
      write: false,
      loader: { '.png': 'dataurl' },
      logLevel: 'silent',
    }),
  ]);

  const uiBundle = uiResult.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = replacePlaceholder(
    replacePlaceholder(template, STYLES_PLACEHOLDER, `<style>\n${styles}</style>`),
    SCRIPT_PLACEHOLDER,
    `<script>\n${uiBundle}</script>`,
  );
  await writeFile(path.join(distDir, 'ui.html'), html);
}

async function runBuild() {
  try {
    await buildOnce();
    console.log(`built ${new Date().toLocaleTimeString()}`);
    return true;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  if (!process.argv.includes('--watch')) {
    if (!(await runBuild())) {
      process.exitCode = 1;
    }
    return;
  }

  await runBuild();
  let timer;
  watch(srcDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(runBuild, 100);
  });
  console.log('watching src');
}

main();
