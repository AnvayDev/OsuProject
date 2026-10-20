// Generates public/assets/ (git-ignored) from osu-resources / osu-framework resources, so the repo doesn't carry ~30 MB of
// derived binaries. Runs before `npm run dev` / `npm run build` (incl. Vercel) and is a no-op when already up to date.
// Clones the reference repos at pinned commits if _reference/ is missing.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pins = {
  // The user's client is 2026.1005.0-lazer; these are the versions its osu.Game.csproj references.
  'osu-resources': 'd481bc98f2603348ee81c15174cd72604286310d', // tag 2026.918.0
  'osu-framework': '37c3e328c8cc7a018234ec78982ea12d3712096a', // tag 2026.921.1
};

const stampFile = path.resolve('public/assets/.stamp');
const generatorVersion = '1'; // bump when the generated layout changes
const stamp = JSON.stringify({ generatorVersion, pins });

if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp && !process.argv.includes('--force')) {
  console.log('assets up to date');
  process.exit(0);
}

for (const [repo, commit] of Object.entries(pins)) {
  const dir = path.resolve('_reference', repo);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execSync(`git clone --filter=blob:none https://github.com/ppy/${repo}.git ${dir}`, { stdio: 'inherit' });
    execSync(`git -C ${dir} checkout --quiet ${commit}`, { stdio: 'inherit' });
  } else {
    const head = execSync(`git -C ${dir} rev-parse HEAD`).toString().trim();
    if (head !== commit) console.warn(`warning: _reference/${repo} is at ${head}, assets are pinned to ${commit}`);
  }
}

fs.rmSync(path.resolve('public/assets'), { recursive: true, force: true });
execSync('node scripts/build-fonts.mjs', { stdio: 'inherit' });

fs.writeFileSync(stampFile, stamp);
