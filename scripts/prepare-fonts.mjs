import fs from 'node:fs/promises';
await fs.mkdir('public/assets/fonts', { recursive: true });
const css = await fs.readFile('tmp/fonts.css', 'utf8');
let config = [];
const local = css.replace(/@font-face\s*\{[^}]+\}/g, (block) => {
  const family = block.match(/font-family: '([^']+)'/)[1];
  const weight = block.match(/font-weight: (\d+)/)[1];
  const url = block.match(/url\(([^)]+)\)/)[1];
  const file = `${family.toLowerCase().replaceAll(' ', '-')}-${weight}.ttf`;
  config.push(`url = "${url}"\noutput = "public/assets/fonts/${file}"\nsilent\nshow-error\nfail\nlocation`);
  return block.replace(url, `../public/assets/fonts/${file}`);
});
await fs.writeFile('tmp/font-downloads.txt', config.join('\nnext\n'));
await fs.writeFile('src/fonts.css', local);
