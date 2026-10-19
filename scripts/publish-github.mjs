// Run from an ordinary Windows terminal: npm run publish:github
// No tokens are accepted by this script. GitHub CLI handles its own sign-in.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'tmp', 'github-publish');
const owner = 'fowlong', name = 'ponyhaven', repo = `${owner}/${name}`;
const website = `https://${owner}.github.io/${name}/`;
const folders = ['.github', 'src', 'public', 'desktop', 'engines', 'scripts', 'tests'];
const rootFiles = ['.env.example', '.gitignore', '.prettierrc.json', 'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.ts', 'firebase.json', 'firebase.test.json', 'firestore.rules', 'firestore.indexes.json', 'Publish-Ponyhaven.cmd'];
const firebaseKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

function run(command, args, options = {}) {
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options });
  if (r.error) throw r.error;
  if (r.status !== 0 && !options.allowFailure) throw new Error(`${path.basename(command)} ${args[0]} failed (${r.status}). ${r.stderr || ''}`);
  return r;
}
async function collect(dir) {
  const paths = [];
  for (const entry of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Do not publish symbolic links: ${relative}`);
    if (entry.isDirectory()) paths.push(...await collect(relative));
    else paths.push(relative);
  }
  return paths;
}
function withinStage(relative) {
  const destination = path.resolve(stage, relative);
  if (!destination.startsWith(stage + path.sep)) throw new Error('Invalid publishing path.');
  return destination;
}
async function prepare() {
  const docs = (await fs.readdir(root)).filter(n => /\.(md|txt)$/i.test(n));
  const files = [...rootFiles, ...docs];
  for (const folder of folders) files.push(...await collect(folder));
  files.sort();
  let bytes = 0;
  for (const relative of files) {
    if (/(^|\/)(private|node_modules|native|release|tmp|\.git)(\/|$)/i.test(relative) || /service-account|admin\.local|\.env\.local|\.env\..*\.local|allowed-emails/i.test(relative)) throw new Error(`Private path in publication: ${relative}`);
    const stat = await fs.stat(path.join(root, relative));
    if (stat.size > 95_000_000) throw new Error(`File too large for this source publication: ${relative}`);
    bytes += stat.size;
    if (/\.(?:ts|mjs|cjs|json|md|txt|yml|yaml|html|css)$/i.test(relative)) {
      const text = await fs.readFile(path.join(root, relative), 'utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"|gh[pousr]_[A-Za-z0-9]{30,}/.test(text)) throw new Error(`Possible private credential in ${relative}; publication stopped.`);
    }
  }
  await fs.mkdir(stage, { recursive: true });
  const manifestFile = path.join(root, 'tmp', 'github-publish-manifest.json');
  const previous = JSON.parse(await fs.readFile(manifestFile, 'utf8').catch(() => '[]'));
  // Remove only files previously copied by this publisher and now removed at source.
  for (const relative of previous) if (!files.includes(relative)) await fs.unlink(withinStage(relative)).catch(e => { if (e.code !== 'ENOENT') throw e; });
  for (const relative of files) {
    const destination = withinStage(relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(root, relative), destination);
  }
  await fs.writeFile(manifestFile, JSON.stringify(files, null, 2));
  console.log(`Prepared ${files.length} source/art files (${(bytes / 1_000_000).toFixed(1)} MB).`);
  console.log('Excluded local environment files, account lists, credentials, saves, native runtimes and release builds.');
  return { files, previous };
}
async function githubCLI() {
  const installed = run('where.exe', ['gh.exe'], { allowFailure: true });
  if (installed.status === 0) return installed.stdout.trim().split(/\r?\n/)[0];
  const destination = path.join(root, 'tmp', 'github-cli');
  const executable = path.join(destination, 'bin', 'gh.exe');
  if (await fs.access(executable).then(() => true, () => false)) return executable;
  console.log('Downloading the official portable GitHub CLI into tmp/github-cli (no system installation).');
  const response = await fetch('https://api.github.com/repos/cli/cli/releases/latest', { headers: { 'User-Agent': 'Ponyhaven-Publisher', Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Could not read the official GitHub CLI release. Check the internet connection.');
  const release = await response.json();
  const archive = release.assets.find(a => /_windows_amd64\.zip$/.test(a.name));
  const checksums = release.assets.find(a => /_checksums\.txt$/.test(a.name));
  if (!archive || !checksums) throw new Error('The official release is missing its Windows archive/checksums.');
  const download = async url => { const r = await fetch(url); if (!r.ok) throw new Error('GitHub CLI download failed.'); return r; };
  const data = Buffer.from(await (await download(archive.browser_download_url)).arrayBuffer());
  const checksumText = await (await download(checksums.browser_download_url)).text();
  const expected = checksumText.split(/\r?\n/).find(line => line.trim().split(/\s+/).at(-1) === archive.name)?.split(/\s+/)[0];
  if (!expected || createHash('sha256').update(data).digest('hex') !== expected) throw new Error('GitHub CLI checksum mismatch.');
  const archivePath = path.join(root, 'tmp', archive.name);
  await fs.writeFile(archivePath, data);
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:PONYHAVEN_GH_ARCHIVE -DestinationPath $env:PONYHAVEN_GH_EXTRACT -Force'], { env: { ...process.env, PONYHAVEN_GH_ARCHIVE: archivePath, PONYHAVEN_GH_EXTRACT: destination } });
  await fs.access(executable);
  return executable;
}

try {
  const { files, previous } = await prepare();
  if (process.argv.includes('--prepare-only')) { console.log('Preparation only; no GitHub requests or publication.'); process.exit(0); }
  if (process.platform !== 'win32') throw new Error('This publisher is prepared for the owner\'s Windows computer.');
  const { loadEnv } = await import('vite');
  const env = loadEnv('production', root, 'VITE_');
  if (firebaseKeys.some(key => !env[key])) throw new Error('Complete the four public Firebase values in .env.local first.');
  if (env.VITE_FIREBASE_PROJECT_ID !== 'mlp4kt') throw new Error('Expected the owner\'s mlp4kt Firebase project. Check .env.local.');
  const gh = await githubCLI();
  if (run(gh, ['auth', 'status', '--hostname', 'github.com'], { allowFailure: true }).status !== 0) {
    console.log('Complete GitHub CLI\'s browser sign-in as fowlong. Do not paste tokens into chat.');
    run(gh, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'workflow'], { stdio: 'inherit', windowsHide: false });
  }
  const login = run(gh, ['api', 'user', '--jq', '.login']).stdout.trim();
  if (login !== owner) throw new Error(`Signed in as ${login}. Use GitHub CLI to select ${owner}, then retry.`);
  const lookup = run(gh, ['repo', 'view', repo, '--json', 'nameWithOwner,isPrivate'], { allowFailure: true });
  if (lookup.status !== 0) {
    run(gh, ['repo', 'create', repo, '--public', '--description', 'Ponyhaven: a free personal MLP fan game and mobile companion.', '--disable-wiki', '--homepage', website], { stdio: 'inherit' });
  } else if (JSON.parse(lookup.stdout).isPrivate) throw new Error('The existing repository is private. This publisher will not change its visibility.');

  for (const key of firebaseKeys) run(gh, ['variable', 'set', key, '--repo', repo], { input: env[key] });
  // This exact folder may have been prepared by Codex's separate Windows user.
  // Trust only it for this invocation; never alter global safe.directory settings.
  const git = (args, options = {}) => run('git', ['-c', `safe.directory=${stage.replaceAll('\\', '/')}`, ...args], { cwd: stage, ...options });
  if (!await fs.access(path.join(stage, '.git')).then(() => true, () => false)) git(['init', '-b', 'main']);
  const origin = git(['remote', 'get-url', 'origin'], { allowFailure: true });
  const remote = `https://github.com/${repo}.git`;
  if (origin.status === 0 && origin.stdout.trim() !== remote) throw new Error('The publishing checkout has a different origin. Nothing was pushed.');
  if (origin.status !== 0) git(['remote', 'add', 'origin', remote]);
  // Scope authentication to this generated checkout; do not change global Git settings.
  git(['config', '--local', 'credential.https://github.com.helper', '']);
  git(['config', '--local', '--add', 'credential.https://github.com.helper', `!"${gh.replaceAll('\\', '/')}" auth git-credential`]);
  git(['config', '--local', 'user.name', owner]);
  git(['config', '--local', 'user.email', '110037490+fowlong@users.noreply.github.com']);
  const tracked = new Set(git(['ls-files', '-z']).stdout.split('\0').filter(Boolean));
  const allowed = new Set(files);
  if ([...tracked].some(file => !allowed.has(file) && !/^(\.env\.example)$/.test(file))) {
    // Previously published source removals are OK, but unknown tracked files need review.
    const prior = new Set(previous);
    if ([...tracked].some(file => !allowed.has(file) && !prior.has(file))) throw new Error('The publishing checkout contains unrecognized tracked files. Review it before publishing.');
  }
  const publishPaths = [...new Set([...files, ...previous.filter(file => tracked.has(file))])];
  git(['--literal-pathspecs', 'add', '--all', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: publishPaths.join('\0') + '\0' });
  const staged = git(['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean);
  if (staged.some(file => /(^|\/)(?:private|native|node_modules|release|\.env\.local)(\/|$)|service-account|allowed-emails/.test(file))) throw new Error('Unexpected private file staged. Nothing was pushed.');
  if (staged.length) git(['commit', '-m', 'Publish Ponyhaven desktop source and mobile companion']);
  const remoteMain = git(['ls-remote', 'origin', 'refs/heads/main']).stdout.trim();
  if (remoteMain) {
    git(['fetch', 'origin', 'main']);
    if (git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { allowFailure: true }).status !== 0) throw new Error('GitHub has changes absent from the generated checkout. Merge them before publishing; no force-push was attempted.');
  }
  git(['push', '-u', 'origin', 'main'], { stdio: 'inherit' });
  const pages = run(gh, ['api', `repos/${repo}/pages`], { allowFailure: true });
  if (pages.status !== 0) run(gh, ['api', '--method', 'POST', `repos/${repo}/pages`, '--input', '-'], { input: JSON.stringify({ build_type: 'workflow' }) });
  else if (JSON.parse(pages.stdout).build_type !== 'workflow') run(gh, ['api', '--method', 'PUT', `repos/${repo}/pages`, '--input', '-'], { input: JSON.stringify({ build_type: 'workflow' }) });
  // An explicit dispatch also rebuilds after config-only changes.
  run(gh, ['workflow', 'run', 'pages.yml', '--repo', repo, '--ref', 'main']);
  const sha = git(['rev-parse', 'HEAD']).stdout.trim();
  const result = { repository: `https://github.com/${repo}`, companion: website, commit: sha, requestedAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, 'tmp', 'github-publication.json'), JSON.stringify(result, null, 2));
  console.log(`Source published: ${result.repository}`);
  console.log(`Deployment running: ${result.repository}/actions`);
  console.log(`Companion after deployment succeeds: ${website}`);
  console.log('Firebase Auth > Settings > Authorized domains must include fowlong.github.io.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Publication failed.');
  process.exitCode = 1;
}
