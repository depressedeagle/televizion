import { test, expect } from '@playwright/test'

test.describe('Movie Catalog and Player', () => {
  test('browse catalog, open movie, balancer player, and return', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    // Verify main app header and category tabs
    await expect(page.locator('.app-title')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /Фильмы и Сериалы/i })).toBeVisible({ timeout: 10000 })
    const catBar = page.locator('.rezka-categories')
    await expect(catBar.getByRole('tab', { name: /Фильмы/ })).toBeVisible()
    await expect(catBar.getByRole('tab', { name: /Сериалы/ })).toBeVisible()

    // Verify movie cards are rendered
    const movieCards = page.locator('.rezka-movie-card')
    await expect(movieCards.first()).toBeVisible({ timeout: 15000 })
    const cardCount = await movieCards.count()
    expect(cardCount).toBeGreaterThan(10)

    // Click on the first movie card
    await movieCards.first().click()

    // Player screen should load
    await expect(page.locator('.rezka-player-wrap')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.rezka-video-wrap')).toBeVisible()
    await expect(page.getByRole('button', { name: /В каталог/i })).toBeVisible()

    // Verify online player iframe is loaded
    await expect(page.locator('.rezka-iframe-player')).toBeVisible({ timeout: 10000 })

    // Click "В каталог" button to return to catalog
    const backBtn = page.getByRole('button', { name: /В каталог/i })
    await backBtn.click()
    await expect(page.locator('.rezka-heading')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.rezka-movie-grid')).toBeVisible()
  })

  test('infinite scroll auto-loading, categories (series, anime) and search', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    // 1. Test auto-loading pagination on scroll
    const initialCount = await page.locator('.rezka-movie-card').count()
    expect(initialCount).toBeGreaterThanOrEqual(12)

    // Scroll to bottom to trigger automatic infinite scroll loading without clicking any button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(async () => {
      const count = await page.locator('.rezka-movie-card').count()
      expect(count).toBeGreaterThan(initialCount)
    }).toPass({ timeout: 10000 })

    // 2. Test categories: Switch to "Сериалы"
    const catBar = page.locator('.rezka-categories')
    const seriesTab = catBar.getByRole('tab', { name: /Сериалы/ })
    await seriesTab.click()
    await expect(page.locator('.rezka-movie-card').first()).toBeVisible({ timeout: 10000 })
    const seriesCount = await page.locator('.rezka-movie-card').count()
    expect(seriesCount).toBeGreaterThanOrEqual(10)

    // 3. Test categories: Switch to "Аниме"
    const animeTab = catBar.getByRole('tab', { name: /Аниме/ })
    await animeTab.click()
    await expect(page.locator('.rezka-movie-card').first()).toBeVisible({ timeout: 10000 })
    const animeCount = await page.locator('.rezka-movie-card').count()
    expect(animeCount).toBeGreaterThanOrEqual(5)

    // 4. Test search for "человек"
    const searchInput = page.getByPlaceholder(/Поиск/i)
    await searchInput.fill('человек')
    await page.getByRole('button', { name: 'Найти' }).click()

    await expect(async () => {
      const searchCount = await page.locator('.rezka-movie-card').count()
      expect(searchCount).toBeGreaterThan(0)
    }).toPass({ timeout: 10000 })
  })
})
