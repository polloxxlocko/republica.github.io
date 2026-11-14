import { test, expect } from '@playwright/test';

test.describe('REPÚBLICA: CHILE — recorrido de extremo a extremo', () => {
  test('crear personaje, actuar, avanzar, navegar, guardar y recargar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /REPÚBLICA/i })).toBeVisible();
    await page.getByTestId('nueva-partida').click();
    await page.getByTestId('nombre').fill('Camila');
    await page.getByTestId('apellido').fill('Fuentes Araya');
    await page.getByTestId('siguiente').click();
    await page.getByTestId('siguiente').click();
    await expect(page.getByTestId('afiliacion-partido')).toBeVisible();
    await page.getByTestId('partido-FA').click();
    await page.getByTestId('siguiente').click();
    await page.getByTestId('comenzar').click();
    await expect(page.getByTestId('fecha')).toContainText('2026');
    await page.getByRole('button', { name: 'Omitir' }).click();

    // Acción con costo de PA
    await page.getByRole('navigation').getByRole('button', { name: 'Acciones', exact: true }).click();
    await page.getByTestId('accion-redes').click();
    await expect(page.getByTestId('pa')).toContainText('2/');

    // Avanzar el calendario
    await page.getByTestId('avanzar').click();
    await expect(page.getByTestId('fecha')).toContainText('16 de noviembre de 2026');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Avanzar cuatro semanas' }).click();
      await expect(page.getByRole('button', { name: 'Avanzar cuatro semanas' })).toBeEnabled({ timeout: 20000 });
      const modal = page.getByRole('dialog', { name: /./ }).filter({ has: page.locator('#decision-title') });
      if (await modal.count()) await modal.locator('button').first().click();
    }

    // Navegación por todas las pantallas
    // Carrera: capital, oportunidades, candidaturas, biografía y legado
    await page.getByRole('navigation').getByRole('button', { name: 'Carrera', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Camila Fuentes Araya/ })).toBeVisible();
    const op = page.getByTestId('oportunidad').first();
    if (await op.count()) await op.locator('[data-testid^="op-"]').first().click();
    await page.getByRole('tab', { name: 'Candidaturas' }).click();
    await expect(page.getByText('Aspirar a una candidatura')).toBeVisible();
    await page.getByRole('tab', { name: 'Información' }).click();
    await expect(page.getByText('Informes, rumores y noticias de tu red')).toBeVisible();
    await page.getByRole('tab', { name: 'Balances electorales' }).click();
    await page.getByRole('tab', { name: 'Oportunidades' }).click();
    await expect(page.getByTestId('situacion')).not.toContainText('%');
    await page.getByRole('tab', { name: 'Biografía' }).click();
    await expect(page.getByTestId('biografia')).toContainText('Camila Fuentes Araya');
    await page.getByRole('tab', { name: 'Legado' }).click();
    await expect(page.getByTestId('legado-puntaje')).toBeVisible();

    for (const name of ['Territorio', 'Partidos', 'Congreso', 'Elecciones', 'Gobierno', 'Economía', 'Noticias', 'Historial']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('main h1').first()).toBeVisible();
    }
    // Detalle de partido y hemiciclo
    await page.getByRole('navigation').getByRole('button', { name: 'Partidos', exact: true }).click();
    await page.getByTestId('ficha-UDI').click();
    await expect(page.getByRole('heading', { name: 'Unión Demócrata Independiente' })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Congreso', exact: true }).click();
    await expect(page.getByRole('group', { name: /Hemiciclo/ })).toBeVisible();

    // Guardar y recargar
    await page.getByRole('navigation').getByRole('button', { name: 'Partida', exact: true }).click();
    await page.getByTestId('guardar').click();
    await expect(page.getByText('Partida guardada.')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page.getByTestId('fecha')).toContainText('2027');
    expect(errors).toEqual([]);
  });

  test('ciclo político completo: avanzar hasta una elección y ver la noche electoral', async ({ page }) => {
    test.setTimeout(240000);
    await page.goto('./');
    await page.getByTestId('nueva-partida').click();
    await page.getByTestId('nombre').fill('Pedro');
    await page.getByTestId('apellido').fill('Soto');
    for (let i = 0; i < 3; i++) await page.getByTestId('siguiente').click();
    await page.getByTestId('comenzar').click();
    await page.getByRole('button', { name: 'Omitir' }).click();
    // Avanza hasta que aparezca la noche electoral (municipales de 2028)
    for (let i = 0; i < 90; i++) {
      if (await page.getByText('Noche electoral').count()) break;
      const dialog = page.locator('[aria-labelledby=decision-title]');
      if (await dialog.count()) { await dialog.locator('button').first().click(); continue; }
      const op = page.getByTestId('oportunidad').first();
      if (await op.count()) { await op.locator('[data-testid^="op-"]').first().click(); }
      await page.getByRole('button', { name: 'Avanzar hasta un evento' }).click();
      await expect(page.getByRole('button', { name: 'Avanzar hasta un evento' })).toBeEnabled({ timeout: 30000 });
      if (!(await page.getByText('Noche electoral').count())) {
        await page.getByRole('navigation').getByRole('button', { name: 'Elecciones', exact: true }).click();
        await page.getByRole('tab', { name: 'Resultados' }).click();
        const btn = page.getByRole('button', { name: 'Ver escrutinio' }).first();
        if (await btn.count()) { await btn.click(); break; }
      }
    }
    await expect(page.getByText(/Noche electoral/)).toBeVisible();
    await page.getByRole('button', { name: 'Resultado final' }).click();
    await expect(page.getByText('Reacciones')).toBeVisible();
  });
});
