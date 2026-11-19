import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';

async function mockPageRequest(page, endpoint) {
    await page.addInitScript(() => localStorage.setItem('token', 'test-token'));
    await page.route(`${API_URL}${endpoint}?**`, async (route) => {
        const requestUrl = new URL(route.request().url());
        expect(requestUrl.searchParams.get('page')).toBe('0');
        expect(requestUrl.searchParams.get('size')).toBe('50');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ content: [] }),
        });
    });
}

test.describe('50-item pagination for customer listings', () => {
    test('loads the first 50 orders', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('token', 'test-token'));
        await page.route(`${API_URL}/customer/orders?**`, async (route) => {
            const requestUrl = new URL(route.request().url());
            const requestedPage = Number(requestUrl.searchParams.get('page'));
            expect(requestUrl.searchParams.get('size')).toBe('50');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    content: [{
                        orderId: `Order ${requestedPage}`,
                        total: 10,
                        shippingCost: 0,
                        currency: 'BRL',
                        itens: [],
                    }],
                    totalPages: 2,
                    totalElements: 51,
                }),
            });
        });

        await page.goto('/orders.html');
        await expect(page.locator('.order-id')).toContainText('Order 0');
        await expect(page.locator('#orders-pagination')).toContainText('Page 1 of 2');

        await page.locator('#orders-pagination').getByRole('button', { name: 'Next' }).click();
        await expect(page.locator('.order-id')).toContainText('Order 1');
        await expect(page.locator('#orders-pagination')).toContainText('Page 2 of 2');
    });

    test('loads the first 50 orders for transport tracking', async ({ page }) => {
        await mockPageRequest(page, '/customer/orders');
        await page.goto('/transport.html');
        await expect(page.locator('#transport-container')).toContainText('Você ainda não possui pedidos');
    });

    test('loads the first 50 vouchers', async ({ page }) => {
        await mockPageRequest(page, '/customer/voucher');
        await page.goto('/voucher.html');
        await expect(page.locator('.container')).toContainText('No vouchers found');
    });
});
