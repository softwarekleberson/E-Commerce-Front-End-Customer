import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const VOUCHER_ID = process.env.CHECKOUT_REPLACEMENT_VOUCHER_ID;

async function getCustomerVouchers(page, headers) {
  const firstPageResponse = await page.request.get(`${API_URL}/customer/voucher`, { headers });
  expect(firstPageResponse.ok()).toBeTruthy();
  const firstPage = await firstPageResponse.json();
  const vouchers = Array.isArray(firstPage) ? [...firstPage] : [...(firstPage.content ?? [])];

  for (let pageNumber = 1; pageNumber < (firstPage.totalPages ?? 1); pageNumber += 1) {
    const response = await page.request.get(
      `${API_URL}/customer/voucher?page=${pageNumber}`,
      { headers }
    );
    expect(response.ok(), `Falha ao consultar a página ${pageNumber} de vouchers`).toBeTruthy();
    const payload = await response.json();
    vouchers.push(...(Array.isArray(payload) ? payload : payload.content ?? []));
  }

  return vouchers;
}

test('cliente paga com cupom acima do valor da compra e recebe um voucher REPLACEMENT', async ({ page }) => {
  test.skip(
    process.env.RUN_REAL_COUPON_PAYMENT !== 'true' ||
      !process.env.LOGIN_EMAIL ||
      !process.env.LOGIN_PASSWORD,
    'Defina RUN_REAL_COUPON_PAYMENT=true, LOGIN_EMAIL e LOGIN_PASSWORD para executar o pagamento real.'
  );
  expect(VOUCHER_ID, 'Defina CHECKOUT_REPLACEMENT_VOUCHER_ID no .env').toBeTruthy();

  await page.goto('/login.html');
  await page.getByLabel('Email').fill(process.env.LOGIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.LOGIN_PASSWORD);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) =>
      res.url() === `${API_URL}/auth/login` && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Login', exact: true }).click(),
  ]);
  expect(loginResponse.ok()).toBeTruthy();
  await page.waitForURL(/\/index\.html$/);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();

  const headers = { Authorization: `Bearer ${token}` };
  const [vouchersBefore, productsResponse] = await Promise.all([
    getCustomerVouchers(page, headers),
    page.request.get(`${API_URL}/public/product`),
  ]);
  expect(productsResponse.ok()).toBeTruthy();

  const voucher = vouchersBefore.find((item) => item.voucherId === VOUCHER_ID);
  expect(voucher, `Cupom ${VOUCHER_ID} não encontrado para o cliente autenticado`).toBeTruthy();
  const previousVoucherIds = new Set(vouchersBefore.map((item) => item.voucherId));

  const productsPayload = await productsResponse.json();
  const products = Array.isArray(productsPayload)
    ? [...productsPayload]
    : [...(productsPayload.content ?? [])];
  for (let pageNumber = 1; pageNumber < (productsPayload.totalPages ?? 1); pageNumber += 1) {
    const response = await page.request.get(`${API_URL}/public/product?page=${pageNumber}`);
    expect(response.ok(), `Falha ao consultar a página ${pageNumber} do catálogo`).toBeTruthy();
    const payload = await response.json();
    products.push(...(Array.isArray(payload) ? payload : payload.content ?? []));
  }

  const product = products.find((item) =>
    item.id && Number(item.price) > 0 && Number(item.price) < Number(voucher.discount)
  );
  expect(
    product,
    `O catálogo precisa ter um produto abaixo do valor do cupom (${voucher.discount})`
  ).toBeTruthy();

  page.on('dialog', (dialog) => dialog.accept());
  const detailsPage = product.category === 'BAG' ? 'bag-details.html' : 'book-details.html';
  await page.goto(`/${detailsPage}?id=${encodeURIComponent(product.id)}`);
  const [addResponse] = await Promise.all([
    page.waitForResponse((res) =>
      res.url() === `${API_URL}/customer/cart` && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: /^Add To Cart$/i }).click(),
  ]);
  expect(addResponse.ok()).toBeTruthy();
  await page.waitForURL(/\/cart\.html$/);
  await expect(
    page.locator('table tbody tr[data-cart-item-id]').filter({ hasText: product.name }).last()
  ).toBeVisible();

  await page.goto('/checkout.html');
  await expect.poll(() => page.evaluate(() => window.checkoutCartTotal)).toBeGreaterThan(0);
  const cartTotal = await page.evaluate(() => window.checkoutCartTotal);
  expect(
    Number(voucher.discount),
    `O cupom (${voucher.discount}) deve ter valor maior que a compra (${cartTotal})`
  ).toBeGreaterThan(cartTotal);

  await page.getByRole('radio', { name: 'Coupon Payment', exact: true }).check();
  await page.locator('#couponCode').fill(VOUCHER_ID);
  await page.getByRole('button', { name: 'Apply Coupon', exact: true }).click();
  const payButton = page.locator('#payButton');
  await expect(payButton).toBeEnabled();

  const [paymentResponse] = await Promise.all([
    page.waitForResponse((res) =>
      res.url() === `${API_URL}/payment/checkout` && res.request().method() === 'POST'
    ),
    payButton.click(),
  ]);
  expect(paymentResponse.ok(), `API respondeu HTTP ${paymentResponse.status()}`).toBeTruthy();
  expect(paymentResponse.request().postDataJSON()).toMatchObject({
    typePayment: 'VOUCHER',
    voucherId: VOUCHER_ID,
  });

  const vouchersAfter = await getCustomerVouchers(page, headers);
  const replacementVoucher = vouchersAfter.find((item) =>
    item.typeVoucher === 'REPLACEMENT' && !previousVoucherIds.has(item.voucherId)
  );
  expect(
    replacementVoucher,
    'O pagamento deveria gerar um novo voucher com typeVoucher REPLACEMENT'
  ).toBeTruthy();

  await page.goto('/voucher.html');
  const replacementVoucherCard = page.locator('.voucher-item').filter({
    hasText: replacementVoucher.voucherId,
  });
  await expect(replacementVoucherCard).toBeVisible();
  await expect(replacementVoucherCard).toContainText('Type: REPLACEMENT');
});
