// Copies the osu-resources directories the web port loads at runtime (Samples, Tracks, Textures) to public/assets/osu.Game.Resources/,
// with an index.json manifest of their relative paths (read by UrlResourceStore so lookups of missing names never hit the network).
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('_reference/osu-resources/osu.Game.Resources');
const target = path.resolve('public/assets/osu.Game.Resources');
const dirs = ['Samples', 'Tracks', 'Textures'];

const files = [];

for (const dir of dirs) {
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(source, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, entry.name);
      if (entry.isDirectory())
        walk(r);
      else {
        fs.mkdirSync(path.dirname(path.join(target, r)), { recursive: true });
        fs.copyFileSync(path.join(source, r), path.join(target, r));
        files.push(r);
      }
    }
  };
  walk(dir);
}

files.sort();
fs.writeFileSync(path.join(target, 'index.json'), JSON.stringify(files));
console.log(`copied ${files.length} osu-resources files (${dirs.join(', ')})`);
