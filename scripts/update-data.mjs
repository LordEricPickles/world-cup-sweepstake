import { readFile, writeFile } from 'node:fs/promises';

const dataPath = new URL('../public/data/worldcup.json', import.meta.url);

async function main() {
  const current = JSON.parse(await readFile(dataPath, 'utf8'));

  const next = {
    ...current,
    updatedAt: new Date().toISOString(),
    source: current.source || 'manual-json'
  };

  await writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Updated ${dataPath.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
