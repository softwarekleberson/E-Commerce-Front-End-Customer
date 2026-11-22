import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const CARD_ID = process.env.CHECKOUT_CARD_ID;
const VOUCHER_ID = process.env.CHECKOUT_CARD_COUPON_VOUCHER_ID_PAGAMENTO_MENOR_DEZ_CARTAO;

async function getCustomerCart(page, headers) {
  const response = await page.request.get(`${API_URL}/customer/cart`, { headers });
  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(
      `Falha ao consultar o carrinho: HTTP ${response.status()} - ${errorBody}`
    );
  }
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

async function emptyCustomerCart(page, headers, cart) {
  for (const item of cart.cartItens ?? []) {
    const cartItemId = item.cartItemId;
    const reservationId = item.reservationId ?? item.reservation_id ?? item.reservationid;
    expect(cartItemId, 'Item do carrinho sem cartItemId').toBeTruthy();
    expect(
      reservationId,
      `Item ${cartItemId} do carrinho não possui reservationId`
    ).toBeTruthy();

    const response = await page.request.delete(
      `${API_URL}/customer/cart/item/${encodeURIComponent(cartItemId)}`,
      {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: JSON.stringify({ reservationId }),
      }
    );
    const errorBody = response.ok() ? '' : await response.text();
    expect(
      response.ok(),
      `Falha ao remover item ${cartItemId}: HTTP ${response.status()} - ${errorBody}`
    ).toBeTruthy();
  }

  const emptiedCart = await getCustomerCart(page, headers);
  expect(
    emptiedCart.cartItens ?? [],
    'O carrinho deve estar vazio antes de adicionar o produto do teste'
  ).toHaveLength(0);
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
  await emptyCustomerCart(page, headers, initialCart);

  const product = products
    .filter((item) => item.id)
    .sort((first, second) => Number(first.price) - Number(second.price))[0];
  expect(product, 'O catálogo não retornou nenhum produto').toBeTruthy();

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
  const cartAfterAdd = await getCustomerCart(page, headers);
  expect(cartAfterAdd.cartItens ?? []).toHaveLength(1);
  expect(cartAfterAdd.cartItens[0].productName).toBe(product.name);
  await expect(
    page.locator('table tbody tr[data-cart-item-id]').filter({ hasText: product.name }).last()
  ).toBeVisible();

  await page.goto('/checkout.html');
  await expect.poll(() => page.evaluate(() => window.checkoutCartTotal)).toBeGreaterThan(0);
  const cartTotal = await page.evaluate(() => window.checkoutCartTotal);
  const voucherDiscount = Number(voucher.discount);
  const amountOnCard = Number((cartTotal - voucherDiscount).toFixed(2));
  expect(amountOnCard, 'O valor restante no cartão deve ser positivo').toBeGreaterThan(0);
  const minimumDiscountForUnderTen = Number((cartTotal - 9.99).toFixed(2));
  expect(
    amountOnCard,
    `Total R$ ${cartTotal.toFixed(2)} menos cupom R$ ${voucherDiscount.toFixed(2)} resulta em R$ ${amountOnCard.toFixed(2)}. Para ficar abaixo de R$ 10,00, o desconto precisa ser de pelo menos R$ ${minimumDiscountForUnderTen.toFixed(2)}.`
  ).toBeLessThan(10);

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
