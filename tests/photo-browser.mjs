import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const panorama = fileURLToPath(new URL('../data/gale/dingo-gap/panorama.webp', import.meta.url));

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
  await upload.setInputFiles(panorama);
  await dialog.getByText(/panorama\.webp/).first().waitFor();
  await dialog.locator('#horizon-projection').selectOption('equirectangular');
  await dialog.locator('#horizon-fov').fill('360');
  await dialog.locator('#horizon-pitch').fill('-34.1');
  const results = dialog.locator('#photo-candidates li');
  assert.equal(await results.count(), 0);
  await dialog.locator('#horizon-match').click();
  await results.first().waitFor({timeout: 120000});
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
