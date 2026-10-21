import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const CARD_ID = process.env.CHECKOUT_CARD_ID;
const VOUCHER_ID = process.env.CHECKOUT_CARD_COUPON_VOUCHER_ID_PAGAMENTO_MENOR_DEZ_CARTAO;

async function getCustomerCart(page, headers) {
  const response = await page.request.get(`${API_URL}/customer/cart`, { headers });
  expect(response.ok(), `Falha ao consultar o carrinho: HTTP ${response.status()}`).toBeTruthy();
  return response.json();
}

async function getProducts(page) {
  const firstResponse = await page.request.get(`${API_URL}/public/product`);
  expect(firstResponse.ok()).toBeTruthy();
  const firstPage = await firstResponse.json();
  const products = Array.isArray(firstPage) ? [...firstPage] : [...(firstPage.content ?? [])];

  for (let pageNumber = 1; pageNumber < (firstPage.totalPages ?? 1); pageNumber += 1) {
    const response = await page.request.get(`${API_URL}/public/product?page=${pageNumber}`);
    expect(response.ok(), `Falha ao consultar a página ${pageNumber} do catálogo`).toBeTruthy();
    const payload = await response.json();
    products.push(...(Array.isArray(payload) ? payload : payload.content ?? []));
  }

  return products;
}

async function payWithCard(page, cardId) {
  await page.goto('/checkout.html');
  await expect.poll(() => page.evaluate(() => window.checkoutCartTotal)).toBeGreaterThan(0);
  await page.getByRole('radio', { name: 'Card Payment', exact: true }).check();
  const cardSelect = page.locator('#registeredCards');
  await expect(cardSelect.locator(`option[value="${cardId}"]`)).toHaveCount(1);
  await cardSelect.selectOption(cardId);
  const payButton = page.locator('#payButton');
  await expect(payButton).toBeEnabled();

  const [paymentResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === `${API_URL}/payment/checkout` &&
      response.request().method() === 'POST'
    ),
    payButton.click(),
  ]);
  expect(paymentResponse.ok(), `Pagamento prévio respondeu HTTP ${paymentResponse.status()}`).toBeTruthy();
  expect(paymentResponse.request().postDataJSON()).toMatchObject({
    typePayment: 'CARD',
    numberCardOne: cardId,
  });
}

test('cliente aplica cupom e paga com cartão um valor menor que R$ 10,00', async ({ page }) => {
  test.skip(
    process.env.RUN_REAL_CARD_COUPON_PAYMENT !== 'true' ||
      !process.env.LOGIN_EMAIL ||
      !process.env.LOGIN_PASSWORD,
    'Defina RUN_REAL_CARD_COUPON_PAYMENT=true, LOGIN_EMAIL e LOGIN_PASSWORD para executar o pagamento real.'
  );
  expect(CARD_ID, 'Defina CHECKOUT_CARD_ID no .env').toBeTruthy();
  expect(
    VOUCHER_ID,
    'Defina CHECKOUT_CARD_COUPON_VOUCHER_ID_PAGAMENTO_MENOR_DEZ_CARTAO no .env'
  ).toBeTruthy();

  await page.goto('/login.html');
  await page.getByLabel('Email').fill(process.env.LOGIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.LOGIN_PASSWORD);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === `${API_URL}/auth/login` && response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Login', exact: true }).click(),
  ]);
  expect(loginResponse.ok()).toBeTruthy();
  await page.waitForURL(/\/index\.html$/);

  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };

  const [initialCart, vouchersResponse, products] = await Promise.all([
    getCustomerCart(page, headers),
    page.request.get(`${API_URL}/customer/voucher`, { headers }),
    getProducts(page),
  ]);
  expect(vouchersResponse.ok()).toBeTruthy();
  const voucherPayload = await vouchersResponse.json();
  const vouchers = Array.isArray(voucherPayload) ? voucherPayload : voucherPayload.content ?? [];
  const voucher = vouchers.find((item) => item.voucherId === VOUCHER_ID);
  expect(voucher, `Cupom ${VOUCHER_ID} não encontrado para o cliente`).toBeTruthy();

  page.on('dialog', (dialog) => dialog.accept());
  // Se já havia produtos no carrinho, finaliza essa compra antes de iniciar o cenário.
  if ((initialCart.cartItens ?? []).length > 0) {
    await payWithCard(page, CARD_ID);
  }

  const cartAfterPriorPayment = await getCustomerCart(page, headers);
  expect(
    cartAfterPriorPayment.cartItens ?? [],
    'O carrinho deveria estar vazio após pagar os itens que já estavam nele'
  ).toHaveLength(0);

  const product = products.find((item) => {
    const price = Number(item.price);
    const amountOnCard = price - Number(voucher.discount);
    return item.id && amountOnCard > 0 && amountOnCard < 10;
  });
  expect(
    product,
    `O catálogo precisa ter um produto com preço entre R$ ${voucher.discount} e R$ ${Number(voucher.discount) + 10}`
  ).toBeTruthy();

  const productPage = product.category === 'BAG' ? 'bag-details.html' : 'book-details.html';
  await page.goto(`/${productPage}?id=${encodeURIComponent(product.id)}`);
  const [addResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === `${API_URL}/customer/cart` && response.request().method() === 'POST'
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
  const amountOnCard = cartTotal - Number(voucher.discount);
  expect(amountOnCard, 'O valor restante no cartão deve ser positivo').toBeGreaterThan(0);
  expect(amountOnCard, 'O valor restante no cartão deve ser menor que R$ 10,00').toBeLessThan(10);

  await page.getByRole('radio', { name: 'Card + Coupon Payment', exact: true }).check();
  const cardSelect = page.locator('#registeredCards');
  await expect(cardSelect.locator(`option[value="${CARD_ID}"]`)).toHaveCount(1);
  await cardSelect.selectOption(CARD_ID);
  await page.locator('#couponCode').fill(VOUCHER_ID);
  await page.getByRole('button', { name: 'Apply Coupon', exact: true }).click();

  const [paymentResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === `${API_URL}/payment/checkout` && response.request().method() === 'POST'
    ),
    page.locator('#payButton').click(),
  ]);
  expect(paymentResponse.ok(), `API respondeu HTTP ${paymentResponse.status()}`).toBeTruthy();
  expect(paymentResponse.request().postDataJSON()).toMatchObject({
    typePayment: 'VOUCHER_CARD',
    numberCardOne: CARD_ID,
    amountCardOne: cartTotal,
    voucherId: VOUCHER_ID,
  });
});
