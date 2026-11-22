import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

export const PIPELINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(PIPELINE_DIR, '..');
export const PRODUCTS_DIR = path.join(REPO_DIR, 'catalog', 'products');
export const OUT_DIR = path.join(PIPELINE_DIR, 'out');

async function loadYaml(file) {
  return YAML.parse(await readFile(file, 'utf8'));
}

export async function loadRules(file = path.join(PIPELINE_DIR, 'config', 'rules.yaml')) {
  return loadYaml(file);
}

export async function loadModels(file = path.join(PIPELINE_DIR, 'config', 'models.yaml')) {
  const { models } = await loadYaml(file);
  return models;
}

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
