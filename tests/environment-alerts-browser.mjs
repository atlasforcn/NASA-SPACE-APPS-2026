import { expect } from '@playwright/test';

export async function verifyEnvironmentAlerts(page, url) {
  const badge = page.locator('.map-badge');
  const temperature = badge.locator('[data-check="temperature"]');
  const radiation = badge.locator('[data-check="radiation"]');
  const settings = page.locator('#environment-readings');
  const heatLimit = settings.locator('#limit-temperature');
  const doseLimit = settings.locator('#limit-radiation');
  const layers = page.getByRole('button', {name: 'Layers', exact: true});
  const explore = page.getByRole('button', {name: 'Explore', exact: true});

  await page.goto(url);
  await page.locator('#start-walk').click();
  await layers.click();
  await settings.locator('summary').click();
  await expect(settings).toContainText('Current mission region has no Radiation station readings');
  await heatLimit.fill('-30');
  await expect(temperature).toBeVisible();
  await expect(temperature).toHaveAccessibleName('Air temperature above limit');
  await expect(radiation).toHaveCount(0);
  await expect(settings).toContainText('Jezero · MEDA');
  await heatLimit.fill('-25.6');
  await expect(temperature).toHaveCount(0);
  await heatLimit.fill('');
  await expect(heatLimit).toHaveAttribute('aria-invalid', 'true');
  await expect(temperature).toHaveCount(0);
  await heatLimit.fill('-20');

  await page.getByRole('button', {name: 'Switch modes'}).click();
  await page.locator('#start-free').click();
  await page.locator('#dem-region-preset').selectOption('gale');
  await page.locator('#load-region').click();
  await expect(temperature).toBeVisible();
  await expect(radiation).toHaveAccessibleName('Radiation above limit');
  await radiation.click();
  await expect(doseLimit).toBeVisible();
  await expect(settings).toContainText('9.86733 µGy/h (Si)');

  const radLayer = page.locator('#panel-content input[value="radiation"]');
  await radLayer.check();
  const station = page.locator('.leaflet-analysis-radiation-pane path.leaflet-interactive').filter({visible: true});
  await station.click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Radiation above limit');
  await expect(popup).toContainText('limit 9 µGy/h (Si)');
  await doseLimit.fill('9.86733');
  await expect(radiation).toHaveCount(0);
  await expect(popup).not.toContainText('Radiation above limit');
  await doseLimit.fill('-1');
  await expect(doseLimit).toHaveAttribute('aria-invalid', 'true');
  await doseLimit.fill('0');
  await expect(radiation).toBeVisible();
  await explore.click();
  await page.locator('#dem-region-preset').selectOption('valles-ctx');
  await page.locator('#load-region').click();
  await expect(page.locator('#region-title')).toHaveText('Valles Marineris');
  await expect(temperature).toHaveCount(0);
  await expect(radiation).toHaveCount(0);
  await page.goto(url);
}
