import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve('tmp/desktop-qa-'+Date.now());
await fs.mkdir(directory,{recursive:true});
const instance=await electron.launch({args:['.','--disable-gpu'],env:{...process.env,PONYHAVEN_USER_DATA:directory},timeout:30000});
try {
  const page=await instance.firstWindow();
  const errors=[];page.on('pageerror',(err)=>errors.push(err.message));
  await page.locator('#activation-form').waitFor();
  await page.screenshot({path:'tmp/qa/desktop-activation.png'});
  // Inject a provider response only in this running QA process. Production has
  // no test key, environment flag, alternate provider, or activation bypass.
  await instance.evaluate(()=>{
    globalThis.fetch=async(url)=>{
      if(url!=='https://api.gumroad.com/v2/licenses/verify')throw new Error('Unexpected QA request');
      return new Response(JSON.stringify({success:true,purchase:{product_id:'EehDWlNREVw0_BpoiwLK4g==',refunded:false,chargebacked:false}}),{status:200});
    };
  });
  await page.locator('#activation-name').fill('Desktop Friend');
  await page.locator('#activation-key').fill('QA-RESPONSE-INJECTION-ONLY');
  await page.locator('[data-action="activate"]').click();
  await page.locator('.starter-grid').waitFor();
  await page.locator('[data-starter="twilight-sparkle"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.locator('#meadow-scene').waitFor();
  await page.locator('[data-care="feed"]').click();
  await page.locator('nav [data-nav="adventure"]').click();
  await page.screenshot({path:'tmp/qa/desktop-adventure.png',fullPage:true});
  await page.locator('nav [data-nav="ponykart"]').click();
  await page.screenshot({path:'tmp/qa/desktop-ponykart.png',fullPage:true});
  await page.locator('nav [data-nav="leaderboard"]').click();
  await page.screenshot({path:'tmp/qa/desktop-leaderboard.png',fullPage:true});
  assert.match(await page.locator('main').innerText(),/Desktop Friend/);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#display-name').fill('Renamed Friend');
  await page.locator('[data-action="save-name"]').click();
  await page.reload();
  await page.locator('nav').waitFor();
  assert.equal((await page.evaluate(()=>window.ponyDesktop.status())).profile.name,'Renamed Friend');
  assert.equal((await page.evaluate(()=>window.ponyDesktop.load())).pet.ponyId,'twilight-sparkle');
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="profiles"]').click();
  await page.locator('#new-profile-name').fill('Second Friend');
  await page.locator('[data-action="create-profile"]').click();
  await page.locator('.starter-grid').waitFor();
  assert.equal((await page.evaluate(()=>window.ponyDesktop.status())).profiles.length,2);
  assert.equal(await page.evaluate(()=>window.ponyDesktop.load()),null);
  const activation=await fs.readFile(path.join(directory,'Ponyhaven','activation.bin'));
  assert.ok(!activation.toString().includes('QA-RESPONSE-INJECTION-ONLY'));
  assert.deepEqual(errors,[]);
  console.log('Desktop activation, encrypted receipt, restart persistence, rename, isolated profiles, and new game screens passed.');
} finally {await instance.close();}
