import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const FIRST_CARD_ID = process.env.CHECKOUT_CARD_ID;
const SECOND_CARD_ID = process.env.CHECKOUT_SECOND_CARD_ID;

async function login(page) {
  await page.goto('/login.html');
  await page.getByLabel('Email').fill(process.env.LOGIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.LOGIN_PASSWORD);

  const [response] = await Promise.all([
    page.waitForResponse((res) =>
      res.url() === `${API_URL}/auth/login` && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Login', exact: true }).click(),
  ]);

  expect(response.ok()).toBeTruthy();
  await page.waitForURL(/\/index\.html$/);
  return page.evaluate(() => localStorage.getItem('token'));
}

async function addProductAndOpenSplitPayment(page, token) {
  expect(FIRST_CARD_ID, 'Defina CHECKOUT_CARD_ID no .env').toBeTruthy();
  expect(SECOND_CARD_ID, 'Defina CHECKOUT_SECOND_CARD_ID no .env').toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const [customerResponse, productsResponse] = await Promise.all([
    page.request.get(`${API_URL}/customer/me`, { headers }),
    page.request.get(`${API_URL}/public/product`),
  ]);

  expect(customerResponse.ok()).toBeTruthy();
  expect(productsResponse.ok()).toBeTruthy();

  const customer = await customerResponse.json();
  const cards = customer.cards ?? [];
  expect(
    cards.some((card) => card.cardId === FIRST_CARD_ID),
    `Cartão principal ${FIRST_CARD_ID} não encontrado na conta`
  ).toBeTruthy();
  const secondCard = cards.find((card) => card.cardId === SECOND_CARD_ID);
  expect(
    secondCard,
    `Segundo cartão ${SECOND_CARD_ID} não encontrado na conta`
  ).toBeTruthy();

  const productsPayload = await productsResponse.json();
  const products = productsPayload.content ?? productsPayload;
  const product = products.find((item) => item.category === 'BOOKS' && item.id);
  expect(product, 'A API não retornou produto da categoria BOOKS').toBeTruthy();

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/book-details.html?id=${encodeURIComponent(product.id)}`);
  const [addResponse] = await Promise.all([
    page.waitForResponse((res) =>
      res.url() === `${API_URL}/customer/cart` && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Add To Cart', exact: true }).click(),
  ]);
  expect(addResponse.ok()).toBeTruthy();
  await page.waitForURL(/\/cart\.html$/);
  await expect(page.locator('table tbody tr').filter({ hasText: product.name }).first()).toBeVisible();

  await page.goto('/checkout.html');
  await expect(page.locator('#summaryTotal')).not.toHaveText('R$ 0,00');
  await page.getByRole('radio', { name: 'Two Cards Payment', exact: true }).check();

  await expect(page.locator(`#registeredCards option[value="${FIRST_CARD_ID}"]`)).toHaveCount(1);
  await expect(page.locator(`#registeredCards2 option[value="${secondCard.cardId}"]`)).toHaveCount(1);
  await page.locator('#registeredCards').selectOption(FIRST_CARD_ID);
  await page.locator('#registeredCards2').selectOption(secondCard.cardId);
  await expect.poll(() => page.locator('#amount1Select option').count()).toBeGreaterThan(1);

  return { secondCard };
}

test.describe('checkout com divisão em dois cartões', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      process.env.RUN_REAL_TWO_CARD_PAYMENT !== 'true' ||
        !process.env.LOGIN_EMAIL ||
        !process.env.LOGIN_PASSWORD,
      'Defina RUN_REAL_TWO_CARD_PAYMENT=true, LOGIN_EMAIL e LOGIN_PASSWORD para executar os pagamentos reais.'
    );
  });

  test('cliente paga o total com divisão válida entre os dois cartões', async ({ page }) => {
    const token = await login(page);
    const { secondCard } = await addProductAndOpenSplitPayment(page, token);

    const amountSelect = page.locator('#amount1Select');
    await expect(amountSelect.locator('option').nth(1)).toBeAttached();
    const firstCardAmountValue = await amountSelect.locator('option').last().getAttribute('value');
    const firstCardAmount = Number(firstCardAmountValue);
    expect(firstCardAmount).toBeGreaterThan(0);
    await amountSelect.selectOption(firstCardAmountValue);
    await expect(page.locator('#payButton')).toBeEnabled();

    const total = await page.evaluate(() => window.checkoutCartTotal);
    const [paymentResponse] = await Promise.all([
      page.waitForResponse((res) =>
        res.url() === `${API_URL}/payment/checkout` && res.request().method() === 'POST'
      ),
      page.locator('#payButton').click(),
    ]);

    expect(paymentResponse.ok(), `API respondeu HTTP ${paymentResponse.status()}`).toBeTruthy();
    expect(paymentResponse.request().postDataJSON()).toMatchObject({
      typePayment: 'TWO_CARDS',
      numberCardOne: FIRST_CARD_ID,
      amountCardOne: firstCardAmount,
      numberCardTwo: secondCard.cardId,
      amountCardTwo: Number((total - firstCardAmount).toFixed(2)),
    });
  });

  test('bloqueia a tentativa de dividir com menos de R$ 10,00 em um cartão', async ({ page }) => {
    const token = await login(page);
    const { secondCard } = await addProductAndOpenSplitPayment(page, token);

    const amountSelect = page.locator('#amount1Select');
    const optionValues = await amountSelect.locator('option').evaluateAll((options) =>
      options.map((option) => option.value).filter(Boolean)
    );
    const underMinimumAmountValue = optionValues.find((value) => {
      const amount = Number(value);
      return amount > 0 && amount < 10;
    });

    expect(underMinimumAmountValue, 'O checkout deve oferecer uma divisão abaixo de R$ 10,00 para validar o bloqueio').toBeDefined();
    const underMinimumAmount = Number(underMinimumAmountValue);
    await amountSelect.selectOption(underMinimumAmountValue);
    await expect(page.locator('#payButton')).toBeEnabled();

    const [paymentResponse] = await Promise.all([
      page.waitForResponse((res) =>
        res.url() === `${API_URL}/payment/checkout` && res.request().method() === 'POST'
      ),
      page.locator('#payButton').click(),
    ]);

    expect(paymentResponse.request().postDataJSON()).toMatchObject({
      typePayment: 'TWO_CARDS',
      numberCardOne: FIRST_CARD_ID,
      amountCardOne: underMinimumAmount,
      numberCardTwo: secondCard.cardId,
    });
    expect(paymentResponse.ok(), 'A API deve rejeitar pagamentos com um dos cartões abaixo de R$ 10,00').toBeFalsy();
    await expect(page).toHaveURL(/\/checkout\.html$/);
    await expect(page.locator('#payButton')).toBeEnabled();
  });
});
