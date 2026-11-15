import assert from 'node:assert/strict';

export async function verifyCuriosityLanding(page, url) {
  const dialog = page.locator('#curiosity-demo');
  const entry = page.locator('#curiosity-demo-entry');
  const result = page.locator('#curiosity-result');
  const referencePin = page.locator('#curiosity-nasa-mark');

  await page.goto(url + '#dingo-gap');
  await dialog.waitFor();
  assert(await result.isHidden());
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.activeElement?.id === 'curiosity-demo-entry');
  assert.equal(new URL(page.url()).hash, '');

  await page.setViewportSize({width:390, height:844});
  await entry.click();
  await dialog.waitFor();
  await page.locator('#curiosity-reveal').waitFor();
  assert.equal(new URL(page.url()).hash, '#dingo-gap');
  assert.doesNotMatch(await dialog.innerText(), /815\s*公尺/);
  assert(await referencePin.isHidden());
  assert(await page.locator('#curiosity-photo').isVisible());
  assert(await page.locator('#curiosity-map').isVisible());

  await page.waitForFunction(() => document.querySelector('#curiosity-map img')?.naturalWidth > 0);
  await page.locator('#curiosity-photo image').evaluate(async image => {
    const decoded = new Image();
    decoded.src = image.href.baseVal;
    await decoded.decode();
  });
  const photo = page.locator('#curiosity-photo');
  for (const [id, curve] of [['curiosity-observed', '.observedY'], ['curiosity-predicted', '.modelY']]) {
    const toggle = page.locator('#' + id);
    assert.match(await photo.locator(curve).getAttribute('d'), /M.+L/);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert(await photo.locator(curve).isHidden());
    await toggle.click();
    assert(await photo.locator(curve).isVisible());
  }
  const view = page.locator('#curiosity-view');
  const initialView = await view.inputValue();
  const otherView = await view.locator('option').evaluateAll(
    (options, initial) => options.find(option => option.value !== initial)?.value, initialView,
  );
  assert(otherView);
  await view.selectOption(otherView);
  await page.locator('#curiosity-reveal').click();
  await referencePin.waitFor();
  assert.match(await result.innerText(), /815\s*公尺/);
  await page.waitForFunction(() => {
    const resultBox = document.getElementById('curiosity-result').getBoundingClientRect();
    const dialogBox = document.getElementById('curiosity-demo').getBoundingClientRect();
    return resultBox.top >= dialogBox.top && resultBox.bottom <= dialogBox.bottom + 1;
  });
  assert(await dialog.locator('a[href*="science.nasa.gov/resource/sol-0539"]').count() > 0);
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({path:'test-results/curiosity-demo-mobile.png'});

  await page.goBack();
  await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.activeElement?.id === 'curiosity-demo-entry');
  await page.setViewportSize({width:1600, height:1000});
  await entry.click();
  await dialog.waitFor();
  await view.waitFor();
  assert.equal(await view.inputValue(), initialView);
  assert(await result.isHidden());
  assert(await referencePin.isHidden());
  await page.locator('#curiosity-close').click();
  await dialog.waitFor({state:'hidden'});
}
