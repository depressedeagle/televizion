import { test, expect } from '@playwright/test'

test.describe('Feed and player', () => {
  test('open feed, click first card, player appears, back returns to feed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('.app-header .app-title')).toBeVisible({ timeout: 30000 })

    const list = page.getByRole('list').first()
    await list.waitFor({ state: 'visible', timeout: 30000 })
    const firstCard = list.getByRole('listitem').first().getByRole('button').first()
    await firstCard.waitFor({ state: 'visible', timeout: 5000 })
    await firstCard.click()

    await expect(page.locator('.rezka-player-wrap')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /В каталог/i })).toBeVisible()

    await page.getByRole('button', { name: /В каталог/i }).click()
    await expect(page.locator('.app-header .app-title')).toBeVisible()
    await expect(page.locator('.rezka-movie-grid')).toBeVisible()
  })
})
