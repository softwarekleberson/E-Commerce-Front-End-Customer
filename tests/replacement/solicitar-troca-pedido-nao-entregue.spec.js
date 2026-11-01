import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';

test('bloqueia solicitação de troca para pedido que não está entregue', async ({ page }) => {
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
  const separatingItem = orders
    .flatMap((order) =>
      (order.itens ?? []).map((item) => ({ order, item }))
    )
    .find(({ item }) => String(item.itemStatus ?? item.status ?? '').toUpperCase() === 'SEPARATING');

  expect(
    separatingItem,
    'É necessário haver ao menos um item de pedido com Status: SEPARATING para executar este cenário.'
  ).toBeTruthy();
  const orderId = separatingItem.order.orderId;
  const reservationId = separatingItem.item.reservationId
    ?? separatingItem.item.reservation_id
    ?? separatingItem.item.reservationid;
  expect(orderId, 'O pedido SEPARATING precisa ter orderId.').toBeTruthy();
  expect(reservationId, 'O item SEPARATING precisa ter reservationId.').toBeTruthy();
  const purchasedQuantity = Number(separatingItem.item.quantity);
  expect(purchasedQuantity, 'O item SEPARATING precisa ter quantidade comprada maior que zero.')
    .toBeGreaterThan(0);
  await page.evaluate((quantity) => {
    sessionStorage.setItem('replacementQuantity', String(quantity));
  }, purchasedQuantity);

  await page.goto(
    `/replacement.html?orderId=${encodeURIComponent(orderId)}&reservationId=${encodeURIComponent(reservationId)}`
  );
  await page.locator('#quantity').fill('1');
  await page.locator('#reason').selectOption({ index: 1 });
  await page.locator('#explain').fill('Tentativa de troca de pedido ainda não entregue.');
  await expect(page.locator('#replacementForm')).toBeVisible();
  expect(
    await page.locator('#replacementForm').evaluate((form) => form.checkValidity()),
    'O formulário precisa estar válido antes de enviar a solicitação.'
  ).toBeTruthy();

  const formStatus = page.locator('#formStatus');
  await expect(formStatus).toBeHidden();
  await page.locator('#replacementForm button[type="submit"]').click();

  await expect(formStatus).toBeVisible();
  await expect(formStatus).toHaveText('The item must be delivered before an exchange is requested, or while the item is undergoing an exchange review.');
});
