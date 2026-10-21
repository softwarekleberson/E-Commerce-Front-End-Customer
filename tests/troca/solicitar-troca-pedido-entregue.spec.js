import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';

test('solicita troca do primeiro item de pedido entregue', async ({ page }) => {
  test.skip(
    !process.env.LOGIN_EMAIL || !process.env.LOGIN_PASSWORD,
    'Defina LOGIN_EMAIL e LOGIN_PASSWORD no .env.'
  );

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
  expect(token, 'O login deve fornecer um token de autenticação.').toBeTruthy();
  const ordersResponse = await page.request.get(`${API_URL}/customer/orders?page=0&size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(ordersResponse.ok(), 'Não foi possível consultar os pedidos do cliente.').toBeTruthy();
  const ordersPayload = await ordersResponse.json();
  const orders = Array.isArray(ordersPayload) ? ordersPayload : ordersPayload.content ?? [];
  const deliveredItem = orders
    .flatMap((order) => (order.itens ?? []).map((item) => ({ order, item })))
    .find(({ item }) => String(item.itemStatus ?? item.status ?? '').toUpperCase() === 'DELIVERED');

  expect(
    deliveredItem,
    'É necessário haver ao menos um item de pedido com Status: DELIVERED para executar este cenário.'
  ).toBeTruthy();
  const orderId = deliveredItem.order.orderId;
  const reservationId = deliveredItem.item.reservationId
    ?? deliveredItem.item.reservation_id
    ?? deliveredItem.item.reservationid;
  expect(orderId, 'O pedido DELIVERED precisa ter orderId.').toBeTruthy();
  expect(reservationId, 'O item DELIVERED precisa ter reservationId.').toBeTruthy();
  const purchasedQuantity = Number(deliveredItem.item.quantity);
  expect(purchasedQuantity, 'O item DELIVERED precisa ter quantidade comprada maior que zero.')
    .toBeGreaterThan(0);
  await page.evaluate((quantity) => {
    sessionStorage.setItem('replacementQuantity', String(quantity));
  }, purchasedQuantity);

  await page.goto(
    `/replacement.html?orderId=${encodeURIComponent(orderId)}&reservationId=${encodeURIComponent(reservationId)}`
  );
  await page.locator('#quantity').fill('1');
  await page.locator('#reason').selectOption({ index: 1 });
  await page.locator('#explain').fill('Solicitação de troca de pedido entregue para teste.');
  await expect(page.locator('#replacementForm')).toBeVisible();
  expect(
    await page.locator('#replacementForm').evaluate((form) => form.checkValidity()),
    'O formulário precisa estar válido antes de enviar a solicitação.'
  ).toBeTruthy();

  const replacementResponsePromise = page.waitForResponse((response) =>
    response.url() === `${API_URL}/customer/replacement` && response.request().method() === 'POST'
  );
  await page.locator('#replacementForm button[type="submit"]').click();
  const replacementResponse = await replacementResponsePromise;
  expect(
    replacementResponse.ok() || replacementResponse.status() === 204,
    `A API recusou a solicitação de troca (HTTP ${replacementResponse.status()}).`
  ).toBeTruthy();
  await expect(page.locator('#formStatus')).toHaveText('Request submitted successfully.');
});
