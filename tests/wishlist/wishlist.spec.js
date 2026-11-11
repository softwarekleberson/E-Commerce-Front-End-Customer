import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';

test.describe('Customer wishlist', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('token', 'wishlist-test-token'));
  });

  test('shows saved products and adds a product to the cart to reserve it again', async ({ page }) => {
    await page.route(`${API_URL}/customer/wishlist`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ productId: 'product-1', addedAt: '2026-11-10T12:00:00' }]),
      });
    });
    await page.route(`${API_URL}/public/product/product-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'product-1',
          name: 'Saved book',
          price: 42.5,
          typeCoin: 'REAL',
          midias: [{ url: '/images/book.png' }],
        }),
      });
    });
    await page.route(`${API_URL}/customer/cart`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/wishlist.html');
    await expect(page.getByRole('heading', { name: 'Saved book' })).toBeVisible();
    await expect(page.getByText('R$ 42.50')).toBeVisible();

    const [addRequest] = await Promise.all([
      page.waitForRequest((request) =>
        request.url() === `${API_URL}/customer/cart` && request.method() === 'POST'
      ),
      page.getByRole('button', { name: 'Add to Cart' }).click(),
    ]);

    expect(addRequest.postDataJSON()).toEqual({ productId: 'product-1', quantity: 1 });
    await page.waitForURL('**/cart.html');
  });

  test('removes a saved product from the wishlist', async ({ page }) => {
    await page.route(`${API_URL}/customer/wishlist`, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ productId: 'product-1', addedAt: '2026-11-10T12:00:00' }]),
      });
    });
    await page.route(`${API_URL}/public/product/product-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'product-1', name: 'Saved book', price: 42.5, typeCoin: 'REAL' }),
      });
    });
    await page.route(`${API_URL}/customer/wishlist/product-1`, async (route) => {
      expect(route.request().method()).toBe('DELETE');
      await route.fulfill({ status: 204 });
    });

    await page.goto('/wishlist.html');
    await expect(page.getByRole('heading', { name: 'Saved book' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove from Wishlist' }).click();

    await expect(page.locator('.wishlist-card')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Your wishlist is empty');
  });
});
