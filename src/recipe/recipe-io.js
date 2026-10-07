import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { assertValidRecipeAsset } from './recipe-validator.js';
import { migrateRecipeAsset } from './recipe-migration.js';

const run = promisify(execFile);
const stable = value => JSON.stringify(value, Object.keys(value).sort(), 2);

export async function openRecipe(file) { const source = JSON.parse(await readFile(file, 'utf8')); const migrated = migrateRecipeAsset(source); assertValidRecipeAsset(migrated.recipe); return migrated; }
export async function saveRecipe(file, recipe) { assertValidRecipeAsset(recipe); await mkdir(path.dirname(path.resolve(file)), { recursive: true }); await writeFile(file, `${JSON.stringify(recipe, null, 2)}\n`); return { path: path.resolve(file), bytes: (await stat(file)).size }; }
export const importRecipe = openRecipe;
export const exportRecipe = saveRecipe;

export async function packageRecipe(file, recipe) {
  assertValidRecipeAsset(recipe);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ink-recipe-'));
  try {
    const recipePath = path.join(temporary, 'recipe.inkrecipe.json'), manifestPath = path.join(temporary, 'manifest.json'), epoch = new Date('2000-01-01T00:00:00.000Z');
    const bytes = Buffer.from(`${JSON.stringify(recipe, null, 2)}\n`), hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(recipePath, bytes); await writeFile(manifestPath, `${JSON.stringify({ format: 'INK-RECIPE-PACKAGE', version: '1.0', recipeId: recipe.recipeId, files: [{ path: 'recipe.inkrecipe.json', sha256: hash, bytes: bytes.length }] }, null, 2)}\n`);
    await utimes(recipePath, epoch, epoch); await utimes(manifestPath, epoch, epoch); await mkdir(path.dirname(path.resolve(file)), { recursive: true });
    await run('zip', ['-X', '-q', '-j', path.resolve(file), recipePath, manifestPath]);
    return { path: path.resolve(file), bytes: (await stat(file)).size, sha256: createHash('sha256').update(await readFile(file)).digest('hex') };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
