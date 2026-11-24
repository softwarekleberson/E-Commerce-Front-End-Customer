import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const RESPONSE_ID = 'response-123';

test.describe('Recommendation chat feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('token', 'chat-test-token'));
  });

  test('sends and updates a like or dislike for the generated answer', async ({ page }) => {
    const feedbackRequests = [];

    await page.route(`${API_URL}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/customer/recommendations' && request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/customer/recommendations/chat' && request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ responseId: RESPONSE_ID, answer: 'Resposta de teste.', recommendations: [] }),
        });
        return;
      }

      if (url.pathname === `/customer/recommendations/chat/${RESPONSE_ID}/feedback`) {
        feedbackRequests.push({
          body: request.postDataJSON(),
          authorization: request.headers().authorization,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ responseId: RESPONSE_ID, ...request.postDataJSON() }),
        });
        return;
      }

      await route.abort();
    });

    await page.goto('/chat.html');
    await page.getByLabel('Descreva o que você procura').fill('Quero um livro de aventura');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();

    await expect(page.getByText('Resposta de teste.')).toBeVisible();
    const likeButton = page.getByRole('button', { name: 'Gostei da resposta', exact: true });
    const dislikeButton = page.getByRole('button', { name: 'Não gostei da resposta', exact: true });
    await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    await likeButton.click();
    await expect(page.getByRole('status')).toHaveText('Obrigado pelo feedback.');
    await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
    await dislikeButton.click();
    await expect(page.getByRole('status')).toHaveText('Obrigado pelo feedback.');
    await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    await expect(dislikeButton).toHaveAttribute('aria-pressed', 'true');

    expect(feedbackRequests).toEqual([
      { body: { liked: true }, authorization: 'Bearer chat-test-token' },
      { body: { liked: false }, authorization: 'Bearer chat-test-token' },
    ]);
  });

  test('shows an error and allows retrying when feedback cannot be saved', async ({ page }) => {
    let attempts = 0;

    await page.route(`${API_URL}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/customer/recommendations' && request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/customer/recommendations/chat' && request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ responseId: RESPONSE_ID, answer: 'Resposta de teste.', recommendations: [] }),
        });
        return;
      }

      if (url.pathname === `/customer/recommendations/chat/${RESPONSE_ID}/feedback`) {
        attempts += 1;
        await route.fulfill({
          status: attempts === 1 ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify({ responseId: RESPONSE_ID, liked: true }),
        });
        return;
      }

      await route.abort();
    });

    await page.goto('/chat.html');
    await page.getByLabel('Descreva o que você procura').fill('Quero um livro de aventura');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();

    const likeButton = page.getByRole('button', { name: 'Gostei da resposta', exact: true });
    await likeButton.click();
    await expect(page.getByRole('status')).toHaveText(
      'Não foi possível salvar sua avaliação. Tente novamente.'
    );
    await expect(likeButton).toBeEnabled();

    await likeButton.click();
    await expect(page.getByRole('status')).toHaveText('Obrigado pelo feedback.');
    expect(attempts).toBe(2);
  });
});
