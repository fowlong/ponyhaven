import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
const cards = JSON.parse(await fs.readFile('public/data/cards.json', 'utf8'));
await fs.mkdir('public/assets/cards', { recursive: true });
await fs.mkdir('tmp', { recursive: true });
const missing = cards.filter((c) => !existsSync(`public/assets/cards/${c.id}.webp`));
const source = (c) => `${c.image}${c.image.includes('?') ? '&' : '?'}width=480&format=webp`;
if (process.argv.includes('--curl-config')) {
  await fs.writeFile(
    'tmp/all-cards-curl.txt',
    missing
      .map(
        (c) =>
          `url = ${JSON.stringify(source(c))}\noutput = ${JSON.stringify(`public/assets/cards/${c.id}.webp`)}\nsilent\nshow-error\nfail\nlocation\nretry = 2\nmax-time = 45`,
      )
      .join('\nnext\n'),
  );
  console.log(
    `Prepared ${missing.length} source-image downloads. Artwork and any source watermark are preserved.`,
  );
} else {
  let index = 0,
    done = 0;
  const failed = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < missing.length) {
        const c = missing[index++];
        try {
          const response = await fetch(source(c), { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(String(response.status));
          await fs.writeFile(`public/assets/cards/${c.id}.webp`, Buffer.from(await response.arrayBuffer()));
          done++;
          if (done % 100 === 0) console.log(`${done}/${missing.length} images cached`);
        } catch (err) {
          failed.push(c.id);
        }
      }
    }),
  );
  console.log({ downloaded: done, failed });
  if (failed.length) process.exitCode = 1;
}
