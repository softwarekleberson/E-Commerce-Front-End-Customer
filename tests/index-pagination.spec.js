import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';

function pagedResponse(name) {
  return {
    content: [{
      id: name,
      name,
      category: 'BOOKS',
      price: 10,
      typeCoin: 'REAL',
    }],
    totalPages: 2,
    totalElements: 51,
  };
}

test.describe('Product pagination on the index', () => {
  test('loads 50-item catalog pages', async ({ page }) => {
    await page.route(`${API_URL}/public/product?**`, async (route) => {
      const requestUrl = new URL(route.request().url());
      const requestedPage = requestUrl.searchParams.get('page');
      expect(requestUrl.searchParams.get('size')).toBe('50');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pagedResponse(`Catalog page ${requestedPage}`)),
      });
    });

    await page.goto('/index.html');
    await expect(page.locator('#books-container .card__title')).toHaveText('Catalog page 0');
    await expect(page.locator('#catalog-pagination')).toContainText('Page 1 of 2');

    await page.locator('#catalog-pagination').getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#books-container .card__title')).toHaveText('Catalog page 1');
    await expect(page.locator('#catalog-pagination')).toContainText('Page 2 of 2');
  });

  test('paginates filtered search results', async ({ page }) => {
    await page.route(`${API_URL}/public/product/search?**`, async (route) => {
      const requestUrl = new URL(route.request().url());
      const requestedPage = requestUrl.searchParams.get('page');
      expect(requestUrl.searchParams.get('size')).toBe('50');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pagedResponse(`Search page ${requestedPage}`)),
      });
    });

    await page.goto('/index.html');
    await page.getByRole('searchbox', { name: 'Search products' }).fill('Search');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('#search-results-container .card__title')).toHaveText('Search page 0');

    await page.locator('#search-pagination').getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#search-results-container .card__title')).toHaveText('Search page 1');
    await expect(page.locator('#search-pagination')).toContainText('Page 2 of 2');
  });

  test('applies selected filters from the filter button', async ({ page }) => {
    await page.route(`${API_URL}/public/product/search?**`, async (route) => {
      const requestUrl = new URL(route.request().url());
      expect(requestUrl.searchParams.get('category')).toBe('BOOKS');
      expect(requestUrl.searchParams.get('page')).toBe('0');
      expect(requestUrl.searchParams.get('size')).toBe('50');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pagedResponse('Filtered book')),
      });
    });

    await page.goto('/index.html');
    await page.locator('#product-category').selectOption('BOOKS');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('#search-results-container .card__title')).toHaveText('Filtered book');
  });
});
