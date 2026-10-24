import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve('tmp/desktop-qa-'+Date.now());
await fs.mkdir(directory,{recursive:true});
const executablePath=process.env.QA_DESKTOP_EXECUTABLE;
const instance=await electron.launch({executablePath,args:executablePath?['--disable-gpu']:['.','--disable-gpu'],env:{...process.env,PONYHAVEN_USER_DATA:directory},timeout:30000});
try {
  const page=await instance.firstWindow();
  const errors=[];page.on('pageerror',(err)=>errors.push(err.message));
  await page.locator('#profile-form, #account-form').waitFor();
  assert.equal(await page.locator('#activation-form').count(),0);
  if(await page.locator('#account-form').count()){
    assert.ok(process.env.QA_ACCOUNT&&process.env.QA_PASSWORD,'Set QA_ACCOUNT / QA_PASSWORD to an invited QA account for a configured build.');
    await page.locator('#login-account').fill(process.env.QA_ACCOUNT);await page.locator('#login-password').fill(process.env.QA_PASSWORD);await page.locator('[data-action="login"]').click();
  }else{
    await page.locator('#profile-name').fill('Desktop Friend');await page.locator('[data-action="create-first-profile"]').click();
  }
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
  assert.equal(await fs.stat(path.join(directory,'Ponyhaven','activation.bin')).then(()=>true,()=>false),false);
  assert.deepEqual(errors,[]);
  console.log('Desktop account/profile creation without activation, restart persistence, rename, isolated profiles, and new game screens passed.');
} finally {await instance.close();}
