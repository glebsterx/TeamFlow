import { test, expect } from '@playwright/test';

// На полностью пустой БД (has_users=false) приложение всегда уводит на /setup —
// это штатное поведение (см. Welcome.tsx / SetupWizard.tsx), не баг.
// Поэтому сначала проходим Setup Wizard (создаёт первого пользователя),
// и только потом проверяем обычный Welcome/Login экран — на нём has_users уже true.

test('first run: setup wizard creates admin, then create a task and change its status', async ({ page }) => {
  const login = `e2e_${Date.now()}`;
  const password = 'e2e-test-password-123';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByText('Шаг 1: Telegram Bot Token')).toBeVisible({ timeout: 15000 });

  await page.getByText('Пропустить →').click();
  await expect(page.getByText('Шаг 2: Создание администратора')).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder('admin').fill(login);
  await page.getByPlaceholder('Минимум 6 символов').fill(password);
  await page.getByPlaceholder('Повторите пароль').fill(password);
  await page.getByRole('button', { name: 'Создать администратора' }).click();

  await expect(page.getByText('Шаг 3: Системные настройки')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Завершить настройку → TeamFlow' }).click();

  await expect(page.getByText('Войти в систему')).not.toBeVisible({ timeout: 15000 });

  const title = `E2E task ${Date.now()}`;
  await page.getByRole('button', { name: '+ Задача' }).click();
  await page.getByPlaceholder('Название задачи').fill(title);
  await page.getByRole('button', { name: 'Создать', exact: true }).click();

  const taskCard = page.getByText(title);
  await expect(taskCard).toBeVisible({ timeout: 10000 });

  await taskCard.click();
  await expect(page.getByText('Редактировать')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '🔄 В работе' }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByText(title)).toBeVisible();
  expect(errors).toEqual([]);
});

test('unauthenticated Welcome page renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TeamFlow' })).toBeVisible();
  await expect(page.getByText('Войти в систему')).toBeVisible();
  expect(errors).toEqual([]);
});
