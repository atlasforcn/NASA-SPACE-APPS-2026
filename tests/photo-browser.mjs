import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const panorama = fileURLToPath(new URL('../data/gale/dingo-gap/panorama.webp', import.meta.url));

// Independent NASA PLACES camera records for the three panorama acquisitions.
const cameraPositions = [
  { sample: 'sol-38', lat: -4.5902435, lng: 137.443301601 },
  { sample: 'sol-535', lat: -4.626590037, lng: 137.407094466 },
  { sample: 'sol-539', lat: -4.626746242, lng: 137.406491898 },
];

function marsDistanceMeters(a, b) {
  const radians = Math.PI / 180;
  const unitVector = ({lat, lng}) => [
    Math.cos(lat * radians) * Math.cos(lng * radians),
    Math.cos(lat * radians) * Math.sin(lng * radians),
    Math.sin(lat * radians),
  ];
  const [x, y, z] = unitVector(a);
  const [u, v, w] = unitVector(b);
  const crossLength = Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u);
  const angle = Math.atan2(crossLength, x * u + y * v + z * w);
  return 3396190 * angle;
}

async function verifyNasaPhotos(dialog) {
  const picks = dialog.locator('[data-photo-sample]');
  const candidates = dialog.locator('#photo-candidates li button');
  const reveal = dialog.locator('#photo-reveal-reference');
  const error = dialog.locator('#photo-position-error');
  const referencePin = dialog.locator('#photo-reference-pin');
  await picks.first().waitFor();
  assert.deepEqual((await picks.evaluateAll(buttons => buttons.map(b => b.dataset.photoSample))).sort(),
    cameraPositions.map(p => p.sample).sort());

  for (const position of cameraPositions) {
    const pick = dialog.locator(`[data-photo-sample="${position.sample}"]`);
    await pick.click();
    await dialog.locator(`[data-photo-sample="${position.sample}"][aria-pressed="true"]`).waitFor();
    assert.equal(await candidates.count(), 0);
    assert(await referencePin.isHidden());
    assert(await error.isHidden());
    assert.match(await dialog.locator('#photo-source-record').getAttribute('href'), /^https:\/\/[^/]*nasa\.gov\//);
    await dialog.locator('#horizon-match').click();
    await candidates.first().waitFor({ timeout: 120000 });
    const top = await candidates.first().evaluate(button => ({
      lat: Number(button.dataset.lat), lng: Number(button.dataset.lng),
    }));
    // Gale's 10 km DEM is centred at 4.59° S, 137.44° E.
    assert(Math.abs(top.lat + 4.59) < 0.09 && Math.abs(top.lng - 137.44) < 0.09);
    const expected = marsDistanceMeters(top, position);
    assert(await error.isHidden());
    assert(await referencePin.isHidden());
    await candidates.nth(1).click();
    await reveal.click();
    await error.waitFor();
    assert(await referencePin.isVisible());
    const measured = Number(await error.getAttribute('data-meters'));
    assert(Number.isFinite(measured) && Math.abs(measured - expected) < 1,
      `${position.sample}: displayed error ${measured} m, independent calculation ${expected} m`);
    assert.match(await dialog.locator('#photo-reference-record').getAttribute('href'), /^https:\/\/[^/]*nasa\.gov\//);
    console.log(`NASA ${position.sample}: top candidate error ${Math.round(measured)} m`);
  }
}

export async function verifyPhotoMatcher(page, url) {
  const photoUrl = url + '#photo-matcher';
  const dialog = page.locator('#photo-match:modal');
  const entry = page.locator('#curiosity-demo-entry + #start-photo');
  const close = dialog.locator('#photo-close');
  const upload = dialog.locator('#horizon-photo');

  await page.goto('about:blank');
  await page.goto(photoUrl);
  await upload.waitFor();
  await page.reload();
  await upload.waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#start-photo:focus').waitFor();
  assert.equal(page.url(), url);
  assert.equal(new URL(await entry.getAttribute('href'), url).href, photoUrl);

  await page.locator('#curiosity-demo-entry').click();
  await page.locator('#curiosity-close').click();
  await page.locator('#curiosity-demo-entry:focus').waitFor();
  await entry.click();
  await upload.waitFor();
  assert.equal(page.url(), photoUrl);
  await page.goBack();
  await page.locator('#start-photo:focus').waitFor();
  await page.goForward();
  await upload.waitFor();

  const originalViewport = page.viewportSize();
  await page.setViewportSize({width: 390, height: 844});
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  const duplicateIds = await dialog.evaluate(el => {
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    return [...el.querySelectorAll('[id]')].map(node => node.id)
      .filter(id => ids.indexOf(id) !== ids.lastIndexOf(id));
  });
  assert.deepEqual(duplicateIds, []);
  await verifyNasaPhotos(dialog);
  await dialog.locator('#horizon-pitch').fill('-20');
  assert(await dialog.locator('#photo-position-error').isHidden());
  assert.equal(await dialog.locator('#photo-candidates li').count(), 0);
  await upload.setInputFiles(panorama);
  await dialog.getByText(/panorama\.webp/).first().waitFor();
  assert(await dialog.locator('#photo-position-error').isHidden());
  assert(await dialog.locator('#photo-reference-pin').isHidden());
  await dialog.locator('#horizon-projection').selectOption('equirectangular');
  await dialog.locator('#horizon-fov').fill('360');
  await dialog.locator('#horizon-pitch').fill('-34.1');
  const results = dialog.locator('#photo-candidates li');
  assert.equal(await results.count(), 0);
  await dialog.locator('#horizon-match').click();
  await results.first().waitFor({timeout: 120000});
  assert(await dialog.locator('#photo-reveal-reference').isHidden());
  await close.click();
  await page.locator('#start-photo:focus').waitFor();
  await page.setViewportSize(originalViewport);

  await page.locator('#start-walk').click();
  await page.locator('#check-science-route').click();
  const assessed = page.locator('#science-route-verdict[data-verdict="reroute"]');
  await assessed.waitFor();
  await page.locator('.mode-switch').click();
  await entry.click();
  await upload.waitFor();
  await close.click();
  await page.locator('#start-photo:focus').waitFor();
  await page.locator('#start-walk').click();
  await assessed.waitFor();

  await page.locator('.mode-switch').click();
  await page.locator('#start-free').click();
  await page.locator('#open-localization').click();
  const inlineEditor = page.locator('#localization-tool .horizon-input');
  await inlineEditor.locator('summary').click();
  await inlineEditor.locator('#horizon-photo').setInputFiles(panorama);
  await inlineEditor.getByText(/panorama\.webp/).first().waitFor();
  await inlineEditor.locator('#horizon-fov').fill('97');
  await page.locator('#open-photo-matcher').click();
  await upload.waitFor();
  assert.equal(await page.locator('#horizon-photo').count(), 1);
  await close.click();
  await page.locator('#open-photo-matcher:focus').waitFor();
  await inlineEditor.getByText(/panorama\.webp/).first().waitFor();
  assert.equal(await inlineEditor.locator('#horizon-fov').inputValue(), '97');
}
