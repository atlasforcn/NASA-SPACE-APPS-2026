import assert from 'node:assert/strict';

function markerPosition(marker) {
  return marker.evaluate(el => ({x: Number(el.dataset.x), y: Number(el.dataset.y)}));
}

function distanceLabel(meters) {
  return meters >= 1000
    ? (meters / 1000).toLocaleString('zh-TW', {maximumFractionDigits: 2}) + ' 公里'
    : Math.round(meters).toLocaleString('zh-TW') + ' 公尺';
}

async function assertReportedDistance(label, point, truth) {
  const meters = Math.hypot(point.x - truth.x, point.y - truth.y);
  const measured = Number.parseFloat(await label.getAttribute('data-meters'));
  assert(Number.isFinite(measured) && Math.abs(meters - measured) < 0.01,
    'Reported distance must match the separation of the two map markers');
  assert.equal(await label.innerText(), distanceLabel(meters));
}

export async function verifyRouteLocation(page, opener, {repeat = false, screenshot} = {}) {
  const dialog = page.locator('#route-location-challenge');
  const map = dialog.locator('#route-location-map');
  const guess = dialog.locator('#route-location-guess');
  const truth = dialog.locator('#route-location-truth');
  const submit = dialog.locator('#route-location-submit');
  const result = dialog.locator('#route-location-result');
  const system = dialog.locator('#route-location-system');

  await opener.click();
  await dialog.waitFor();
  const ridge = dialog.locator('#route-location-observation');
  await ridge.waitFor();
  assert.match(await ridge.locator('.measured').first().getAttribute('d'), /M.+L/);
  assert(await truth.isHidden() && await guess.isHidden() && await result.isHidden());
  assert(await submit.isHidden() || await submit.isDisabled());
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));

  await map.click();
  await guess.waitFor();
  const first = await markerPosition(guess);
  await map.press('ArrowRight');
  const chosen = await markerPosition(guess);
  assert.notDeepEqual(chosen, first, 'Keyboard adjustment must move the proposed position');
  await dialog.locator('#route-location-preview').waitFor();
  assert(await truth.isHidden());
  await submit.click();
  await truth.waitFor();
  const observedAt = await markerPosition(truth);
  await assertReportedDistance(result.locator('.guess-distance'), chosen, observedAt);
  await system.waitFor();
  await page.waitForFunction(() => document.querySelector('#route-location-system')?.getAttribute('aria-busy') === 'false');
  const candidate = dialog.locator('#route-location-candidate');
  assert(await candidate.isVisible(), 'Worker must produce a candidate for the Jezero test route: ' + await system.innerText());
  await assertReportedDistance(system.locator('.system-distance'), await markerPosition(candidate), observedAt);
  if (screenshot) await page.screenshot({path: screenshot});

  if (repeat) {
    await dialog.locator('#route-location-again').click();
    await ridge.waitFor();
    assert(await truth.isHidden() && await guess.isHidden() && await result.isHidden());
    assert(await submit.isHidden() || await submit.isDisabled());
    await map.press('ArrowUp');
    await map.press('Enter');
    await truth.waitFor();
    assert.notDeepEqual(await markerPosition(truth), observedAt, 'Retry should sample another route viewpoint');
    await page.keyboard.press('Escape');
  } else {
    await dialog.locator('#route-location-close').click();
  }
  await dialog.waitFor({state: 'hidden'});
  assert(await opener.evaluate(el => el === document.activeElement));
  return observedAt;
}
