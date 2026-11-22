import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: process.env.LOGIN_EMAIL, 
  password: process.env.LOGIN_PASSWORD,
};

async function adicionarPrimeiroProdutoDoIndex(page) {
  await page.goto('/index.html');

  const primeiroProduto = page.locator('#books-container .card').first();
  await expect(primeiroProduto).toBeVisible();

  const linkDetalhes = primeiroProduto.getByRole('link', { name: 'Details', exact: true });
  await Promise.all([
    page.waitForURL(/\/book-details\.html\?/),
    linkDetalhes.click(),
  ]);

  page.on('dialog', (dialog) => dialog.accept());

  await expect(page.getByRole('button', { name: 'Add To Cart', exact: true })).toBeVisible();
  const [addResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === 'http://localhost:8080/customer/cart' &&
      response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Add To Cart', exact: true }).click(),
  ]);

  expect(
    addResponse.ok(),
    `POST respondeu HTTP ${addResponse.status()}`
  ).toBeTruthy();
  await page.waitForURL(/\/cart\.html$/);
}

async function adicionarProdutoDoIndex(page, cardIndex) {
  await page.goto('/index.html');

  const produto = page.locator('#books-container .card').nth(cardIndex);
  await expect(produto).toBeVisible();

  const nomeProduto = await produto.locator('.card__title').textContent();
  await Promise.all([
    page.waitForURL(/\/book-details\.html\?/),
    produto.getByRole('link', { name: 'Details', exact: true }).click(),
  ]);

  await expect(page.getByRole('button', { name: 'Add To Cart', exact: true })).toBeVisible();
  const [addResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url() === 'http://localhost:8080/customer/cart' &&
      response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Add To Cart', exact: true }).click(),
  ]);

  expect(
    addResponse.ok(),
    `POST respondeu HTTP ${addResponse.status()}`
  ).toBeTruthy();
  await page.waitForURL(/\/cart\.html$/);

  return nomeProduto.trim();
}

async function esvaziarCarrinho(page) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token, 'Token de autenticação ausente ao limpar o carrinho').toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };

  const cartResponse = await page.request.get('http://localhost:8080/customer/cart', { headers });
  expect(
    cartResponse.ok(),
    `Falha ao consultar o carrinho para limpeza: HTTP ${cartResponse.status()}`
  ).toBeTruthy();
  const cart = await cartResponse.json();

  for (const item of cart.cartItens ?? []) {
    const cartItemId = item.cartItemId;
    const reservationId = item.reservationId ?? item.reservation_id ?? item.reservationid;
    expect(cartItemId, 'Item do carrinho sem cartItemId').toBeTruthy();
    expect(reservationId, `Item ${cartItemId} sem reservationId`).toBeTruthy();

    const deleteResponse = await page.request.delete(
      `http://localhost:8080/customer/cart/item/${encodeURIComponent(cartItemId)}`,
      {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: JSON.stringify({ reservationId }),
      }
    );
    const errorBody = deleteResponse.ok() ? '' : await deleteResponse.text();
    expect(
      deleteResponse.ok(),
      `Falha ao limpar item ${cartItemId}: HTTP ${deleteResponse.status()} - ${errorBody}`
    ).toBeTruthy();
  }

  const finalResponse = await page.request.get('http://localhost:8080/customer/cart', { headers });
  expect(finalResponse.ok(), 'Falha ao confirmar a limpeza do carrinho').toBeTruthy();
  const finalCart = await finalResponse.json();
  expect(finalCart.cartItens ?? [], 'O carrinho deve ficar vazio ao final de cada teste').toHaveLength(0);
}

test.describe('Fluxo do Carrinho de Compras (E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // 1. Acessa a página de login
    await page.goto('/login.html');

    // 2. Preenche e envia as credenciais de autenticação
    await page.fill('#email', TEST_USER.email);
    await page.fill('#senha', TEST_USER.password);

    const loginPromise = page.waitForResponse(
      (res) => res.url().includes('/auth/login') && res.status() === 200
    );

    await page.click('button[type="submit"]');
    await loginPromise;
    await page.waitForURL(/\/index\.html$/);

    // 3. Valida se o Token JWT foi armazenado no LocalStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) await esvaziarCarrinho(page);
  });

  test('Deve carregar o carrinho do usuário autenticado (Read)', async ({ page }) => {
    await adicionarPrimeiroProdutoDoIndex(page);

    const cartResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/customer/cart') && res.request().method() === 'GET'
    );

    await page.goto('/cart.html');
    const cartResponse = await cartResponsePromise;
    expect(
      cartResponse.status(),
      `GET /customer/cart respondeu HTTP ${cartResponse.status()}`
    ).toBe(200);

    const tabela = page.locator('table');
    await expect(tabela).toBeVisible();

    const linhasItens = page.locator('table tbody tr');
    await expect(linhasItens.first()).toBeVisible();
  });

  test('Deve exibir alerta de estoque insuficiente ao tentar atualizar para 1000 itens', async ({ page }) => {
    let alertMessage = '';
    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('Insufficient stock')) {
        alertMessage = dialog.message();
      }
      await dialog.accept();
    });

    // 1. Carrega o carrinho; se estiver vazio, adiciona um livro para o teste ser independente.
    const cartResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/customer/cart') && res.request().method() === 'GET'
    );
    await page.goto('/cart.html');
    const cartResponse = await cartResponsePromise;
    expect(
      cartResponse.status(),
      `GET /customer/cart respondeu HTTP ${cartResponse.status()}`
    ).toBe(200);

    let primeiraLinha = page.locator('table tbody tr[data-cart-item-id]').first();
    if (await primeiraLinha.count() === 0) {
      const productsResponse = await page.request.get('http://localhost:8080/public/product');
      expect(productsResponse.ok(), `GET produtos respondeu HTTP ${productsResponse.status()}`).toBeTruthy();
      const productsPayload = await productsResponse.json();
      const products = productsPayload.content ?? productsPayload;
      const product = products.find((item) => item.category === 'BOOKS' && item.id);
      expect(product, 'A API precisa retornar um produto da categoria BOOKS.').toBeTruthy();

      await page.goto(`/book-details.html?id=${encodeURIComponent(product.id)}`);
      const [addResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url() === 'http://localhost:8080/customer/cart' &&
          response.request().method() === 'POST'
        ),
        page.getByRole('button', { name: 'Add To Cart', exact: true }).click(),
      ]);
      expect(addResponse.ok(), `POST respondeu HTTP ${addResponse.status()}`).toBeTruthy();
      await page.waitForURL(/\/cart\.html$/);
      primeiraLinha = page.locator('table tbody tr[data-cart-item-id]').first();
    }

    await expect(primeiraLinha).toBeVisible();

    await page.waitForFunction((el) => {
      const resId = el?.getAttribute('data-reservation-id');
      return resId && resId !== 'undefined' && resId.trim() !== '';
    }, await primeiraLinha.elementHandle());

    const inputQuantidade = primeiraLinha.locator('input[type="number"]');
    const quantidadeExcedente = '1000';

    // 2. Altera a quantidade para 1000 e executa os eventos de blur/enter
    await inputQuantidade.click();
    await inputQuantidade.fill(quantidadeExcedente);
    await inputQuantidade.press('Enter');
    await inputQuantidade.blur();

    // 3. Valida se a mensagem do alert capturado é a esperada
    expect(alertMessage).toContain('Insufficient stock');
  });

  test('adiciona dois produtos, atualiza um para 3 e exclui apenas um item', async ({ page }) => {
    test.skip(
      process.env.RUN_REAL_CART_UPDATE_DELETE !== 'true',
      'Defina RUN_REAL_CART_UPDATE_DELETE=true para adicionar, atualizar e remover itens reais do carrinho.'
    );

    page.on('dialog', (dialog) => dialog.accept());

    const primeiroNome = await adicionarProdutoDoIndex(page, 0);
    const segundoNome = await adicionarProdutoDoIndex(page, 1);
    expect(segundoNome, 'O index precisa mostrar pelo menos dois livros distintos').not.toBe(primeiroNome);

    const primeiroRow = page.locator('table tbody tr[data-cart-item-id]')
      .filter({ hasText: primeiroNome })
      .last();
    const segundoRow = page.locator('table tbody tr[data-cart-item-id]')
      .filter({ hasText: segundoNome })
      .last();

    await expect(primeiroRow).toBeVisible();
    await expect(segundoRow).toBeVisible();

    const cartItemId = await primeiroRow.getAttribute('data-cart-item-id');
    const quantityInput = primeiroRow.locator('input[type="number"]');
    await page.waitForFunction((row) => {
      const reservationId = row?.getAttribute('data-reservation-id');
      return reservationId && reservationId !== 'undefined' && reservationId.trim() !== '';
    }, await primeiroRow.elementHandle());

    const [updateResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes(`/customer/cart/update/${cartItemId}`) &&
        response.request().method() === 'PUT'
      ),
      (async () => {
        await quantityInput.fill('3');
        await quantityInput.press('Enter');
        await quantityInput.blur();
      })(),
    ]);
    expect(updateResponse.ok(), `PUT respondeu HTTP ${updateResponse.status()}`).toBeTruthy();
    await expect(quantityInput).toHaveValue('3');

    await page.waitForFunction((row) => {
      const reservationId = row?.getAttribute('data-reservation-id');
      return reservationId && reservationId !== 'undefined' && reservationId.trim() !== '';
    }, await primeiroRow.elementHandle());

    const [deleteResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url() === `http://localhost:8080/customer/cart/item/${cartItemId}` &&
        response.request().method() === 'DELETE'
      ),
      primeiroRow.getByRole('button').click(),
    ]);

    const deleteError = deleteResponse.ok() ? '' : await deleteResponse.text();
    expect(
      deleteResponse.ok(),
      `DELETE respondeu HTTP ${deleteResponse.status()}: ${deleteError}`
    ).toBeTruthy();
    await expect(page.locator(`tr[data-cart-item-id="${cartItemId}"]`)).toHaveCount(0);
    await expect(segundoRow).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('token'));
    await expect.poll(async () => {
      const response = await page.request.get('http://localhost:8080/customer/cart', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.ok()).toBeTruthy();
      const cart = await response.json();
      const items = cart.cartItens ?? [];
      const removed = items.some(
        (item) => String(item.cartItemId) === String(cartItemId)
      );
      const secondStillPresent = items.some(
        (item) => item.productName === segundoNome
      );
      return { removed, secondStillPresent };
    }).toEqual({ removed: false, secondStillPresent: true });
  });

});
