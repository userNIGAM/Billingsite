import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { resolveServing } from '../services/consumption.service';

/**
 * Half-plate / full-plate serving sizes.
 *
 * An admin configures an item as FULL_ONLY (default, price = sellingPricePaisa)
 * or HALF_AND_FULL (sellingPricePaisa = full plate, halfPlatePricePaisa = half).
 * The order screen sends only WHICH serving was ordered; the server resolves the
 * trusted price and a HALF request against a FULL_ONLY item is rejected. The
 * serving size flows through orders, the daily read model (part of its unique
 * key), bills and reports, and every pre-existing row means a full plate.
 */
describe('half / full plate serving sizes', () => {
  const agent = request.agent(createApp());
  const SETUP_TOKEN = 'test-setup-token';

  let teaId = '';
  let comboId = '';
  let twinId = '';
  let priceKhataId = '';
  let dailyKhataId = '';
  let billKhataId = '';
  let voidKhataId = '';
  let reportKhataId = '';
  let dashKhataId = '';

  async function createIndividual(name: string): Promise<string> {
    const res = await agent.post('/api/khatas').send({
      type: 'INDIVIDUAL',
      displayName: name,
      startDate: '2026-01-01',
      billingStartDay: 1,
    });
    expect(res.status).toBe(201);
    return res.body.data.khata._id;
  }

  beforeAll(async () => {
    const setup = await agent.post('/api/auth/setup').send({
      setupToken: SETUP_TOKEN,
      name: 'Serving Admin',
      email: 'serving@test.local',
      password: 'Sup3rSecret!',
    });
    expect(setup.status).toBe(201);

    const tea = await agent.post('/api/items').send({
      name: 'Serving Tea',
      category: 'Drinks',
      sellingPricePaisa: 2500,
      costPricePaisa: 1000,
    });
    expect(tea.status).toBe(201);
    teaId = tea.body.data.item._id;

    const combo = await agent.post('/api/items').send({
      name: 'Combo Meal',
      category: 'Food',
      servingMode: 'HALF_AND_FULL',
      sellingPricePaisa: 3000,
      halfPlatePricePaisa: 1800,
      costPricePaisa: 1200,
    });
    expect(combo.status).toBe(201);
    comboId = combo.body.data.item._id;

    // Full and half priced identically: the two servings must still be
    // separate cells/rows because servingSize is part of the daily key.
    const twin = await agent.post('/api/items').send({
      name: 'Twin Rice',
      category: 'Food',
      servingMode: 'HALF_AND_FULL',
      sellingPricePaisa: 2000,
      halfPlatePricePaisa: 2000,
      costPricePaisa: 500,
    });
    expect(twin.status).toBe(201);
    twinId = twin.body.data.item._id;

    priceKhataId = await createIndividual('Serving Price Khata');
    dailyKhataId = await createIndividual('Serving Daily Khata');
    billKhataId = await createIndividual('Serving Bill Khata');
    voidKhataId = await createIndividual('Serving Void Khata');
    reportKhataId = await createIndividual('Serving Report Khata');
    dashKhataId = await createIndividual('Serving Dashboard Khata');
  });

  describe('item configuration', () => {
    it('defaults to FULL_ONLY with no half price', async () => {
      const res = await agent.get(`/api/items/${teaId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.item.servingMode).toBe('FULL_ONLY');
      expect(res.body.data.item.halfPlatePricePaisa).toBeNull();
    });

    it('rejects a HALF_AND_FULL item without a half price', async () => {
      const res = await agent.post('/api/items').send({
        name: 'No Half Price',
        category: 'Food',
        servingMode: 'HALF_AND_FULL',
        sellingPricePaisa: 3000,
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects switching an item to HALF_AND_FULL without a half price, then accepts it once supplied', async () => {
      const missing = await agent.patch(`/api/items/${teaId}`).send({ servingMode: 'HALF_AND_FULL' });
      expect(missing.status).toBe(422);
      expect(missing.body.code).toBe('VALIDATION_ERROR');

      const ok = await agent.patch(`/api/items/${teaId}`).send({
        servingMode: 'HALF_AND_FULL',
        halfPlatePricePaisa: 1500,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.item.servingMode).toBe('HALF_AND_FULL');
      expect(ok.body.data.item.halfPlatePricePaisa).toBe(1500);

      // Restore FULL_ONLY: the half price is cleared.
      const restore = await agent.patch(`/api/items/${teaId}`).send({ servingMode: 'FULL_ONLY' });
      expect(restore.status).toBe(200);
      expect(restore.body.data.item.halfPlatePricePaisa).toBeNull();
    });
  });

  describe('ordering and pricing', () => {
    it('prices a full plate at the full price', async () => {
      const res = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: priceKhataId,
        itemId: comboId,
        servingSize: 'FULL',
        quantity: 1,
        businessDate: '2026-03-10',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.transaction.servingSize).toBe('FULL');
      expect(res.body.data.transaction.totalPaisa).toBe(3000);
    });

    it('prices a half plate at the half price', async () => {
      const res = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: priceKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-03-10',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.transaction.servingSize).toBe('HALF');
      expect(res.body.data.transaction.totalPaisa).toBe(1800);
    });

    it('treats an omitted serving size as a full plate (legacy clients)', async () => {
      const res = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: priceKhataId,
        itemId: comboId,
        quantity: 1,
        businessDate: '2026-03-10',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.transaction.servingSize).toBe('FULL');
      expect(res.body.data.transaction.totalPaisa).toBe(3000);
    });

    it('rejects a half plate for a FULL_ONLY item', async () => {
      const res = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: priceKhataId,
        itemId: teaId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-03-10',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SERVING_SIZE_NOT_AVAILABLE');
    });
  });

  describe('daily read model', () => {
    it('keeps half and full plates of one item in separate rows', async () => {
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dailyKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-03-11',
      });
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dailyKhataId,
        itemId: comboId,
        servingSize: 'FULL',
        quantity: 1,
        businessDate: '2026-03-11',
      });

      const daily = await agent.get(`/api/consumption/daily?date=2026-03-11&khataId=${dailyKhataId}`);
      expect(daily.status).toBe(200);
      const rows = daily.body.data.rows.filter((r: { itemId: string }) => r.itemId === comboId);
      expect(rows).toHaveLength(2);
      const half = rows.find((r: { servingSize: string }) => r.servingSize === 'HALF');
      const full = rows.find((r: { servingSize: string }) => r.servingSize === 'FULL');
      expect(half.unitPricePaisa).toBe(1800);
      expect(full.unitPricePaisa).toBe(3000);
    });

    it('keeps half and full separate even when priced identically', async () => {
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dailyKhataId,
        itemId: twinId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-03-12',
      });
      const second = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dailyKhataId,
        itemId: twinId,
        servingSize: 'FULL',
        quantity: 1,
        businessDate: '2026-03-12',
      });
      expect(second.status).toBe(201);

      const daily = await agent.get(`/api/consumption/daily?date=2026-03-12&khataId=${dailyKhataId}`);
      const rows = daily.body.data.rows.filter((r: { itemId: string }) => r.itemId === twinId);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r: { servingSize: string }) => r.servingSize))).toEqual(
        new Set(['HALF', 'FULL'])
      );
    });
  });

  describe('billing', () => {
    it('writes separate line items for half and full plates', async () => {
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: billKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-04-05',
      });
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: billKhataId,
        itemId: comboId,
        servingSize: 'FULL',
        quantity: 1,
        businessDate: '2026-04-05',
      });

      const billRes = await agent.post('/api/bills/generate').send({
        khataId: billKhataId,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
      });
      expect(billRes.status).toBe(201);
      const bill = billRes.body.data.bill;
      expect(bill.consumptionTotalPaisa).toBe(4800);
      expect(bill.lineItems).toHaveLength(2);

      const half = bill.lineItems.find((l: { servingSize: string }) => l.servingSize === 'HALF');
      const full = bill.lineItems.find((l: { servingSize: string }) => l.servingSize === 'FULL');
      expect(half.unitPricePaisa).toBe(1800);
      expect(half.totalPaisa).toBe(1800);
      expect(full.unitPricePaisa).toBe(3000);
      expect(full.totalPaisa).toBe(3000);
    });
  });

  describe('voiding', () => {
    it('nets only the half-plate cell it reverses', async () => {
      const order = await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: voidKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 2,
        businessDate: '2026-05-04',
      });
      expect(order.status).toBe(201);
      const txId = order.body.data.transaction._id;

      const before = await agent.get(`/api/consumption/daily?date=2026-05-04&khataId=${voidKhataId}`);
      const beforeRows = before.body.data.rows.filter((r: { itemId: string }) => r.itemId === comboId);
      expect(beforeRows).toHaveLength(1);
      expect(beforeRows[0].servingSize).toBe('HALF');
      expect(beforeRows[0].quantity).toBe(2);
      expect(beforeRows[0].totalPaisa).toBe(3600);

      const voidRes = await agent
        .patch(`/api/consumption/${txId}/void`)
        .send({ reason: 'Wrong serving ordered' });
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data.reversalTotal).toBe(-3600);

      const after = await agent.get(`/api/consumption/daily?date=2026-05-04&khataId=${voidKhataId}`);
      const afterRows = after.body.data.rows.filter((r: { itemId: string }) => r.itemId === comboId);
      expect(afterRows).toHaveLength(0);
    });
  });

  describe('reports', () => {
    beforeAll(async () => {
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: reportKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 1,
        businessDate: '2026-06-06',
      });
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: reportKhataId,
        itemId: comboId,
        servingSize: 'FULL',
        quantity: 2,
        businessDate: '2026-06-06',
      });
    });

    it('splits the sales-by-item report by serving size', async () => {
      const res = await agent.get('/api/reports/sales?from=2026-06-01&to=2026-06-30&groupBy=item');
      expect(res.status).toBe(200);
      expect(res.body.data.totalSalesPaisa).toBe(7800);
      const comboGroups = res.body.data.groups.filter((g: { itemName: string }) => g.itemName === 'Combo Meal');
      expect(comboGroups).toHaveLength(2);
      const half = comboGroups.find((g: { servingSize: string }) => g.servingSize === 'HALF');
      const full = comboGroups.find((g: { servingSize: string }) => g.servingSize === 'FULL');
      expect(half.quantity).toBe(1);
      expect(half.revenuePaisa).toBe(1800);
      expect(full.quantity).toBe(2);
      expect(full.revenuePaisa).toBe(6000);
    });

    it('splits the items report by serving size', async () => {
      const res = await agent.get('/api/reports/items?from=2026-06-01&to=2026-06-30');
      expect(res.status).toBe(200);
      const comboRows = res.body.data.rows.filter((r: { itemName: string }) => r.itemName === 'Combo Meal');
      expect(comboRows).toHaveLength(2);
      const half = comboRows.find((r: { servingSize: string }) => r.servingSize === 'HALF');
      const full = comboRows.find((r: { servingSize: string }) => r.servingSize === 'FULL');
      expect(half.quantity).toBe(1);
      expect(half.revenuePaisa).toBe(1800);
      expect(full.quantity).toBe(2);
      expect(full.revenuePaisa).toBe(6000);
    });
  });

  describe('dashboard', () => {
    it('lists half and full plates as separate top items', async () => {
      // Dated today so it lands in the dashboard's current-month window.
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dashKhataId,
        itemId: comboId,
        servingSize: 'HALF',
        quantity: 3,
      });
      await agent.post('/api/consumption').send({
        consumerType: 'INDIVIDUAL',
        consumerId: dashKhataId,
        itemId: comboId,
        servingSize: 'FULL',
        quantity: 1,
      });

      const res = await agent.get('/api/dashboard/overview');
      expect(res.status).toBe(200);
      const comboTops = res.body.data.topItems.filter((t: { itemId: string }) => t.itemId === comboId);
      expect(comboTops).toHaveLength(2);
      const half = comboTops.find((t: { servingSize: string }) => t.servingSize === 'HALF');
      const full = comboTops.find((t: { servingSize: string }) => t.servingSize === 'FULL');
      expect(half.quantity).toBe(3);
      expect(half.revenuePaisa).toBe(5400);
      expect(full.quantity).toBe(1);
      expect(full.revenuePaisa).toBe(3000);
    });
  });

  describe('backward compatibility', () => {
    it('treats a legacy item with no servingMode as FULL_ONLY', () => {
      const resolved = resolveServing(
        { name: 'Legacy Item', sellingPricePaisa: 2500, halfPlatePricePaisa: null },
        'FULL'
      );
      expect(resolved).toEqual({ servingSize: 'FULL', unitPricePaisa: 2500 });

      let thrown: unknown;
      try {
        resolveServing({ name: 'Legacy Item', sellingPricePaisa: 2500, halfPlatePricePaisa: null }, 'HALF');
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toMatchObject({ code: 'SERVING_SIZE_NOT_AVAILABLE' });
    });

    it('defaults a legacy daily cell with no servingSize to FULL', async () => {
      // Insert past the schema so the document genuinely lacks the field, the
      // way rows written before this change look.
      await DailyConsumption.collection.insertOne({
        khataId: new mongoose.Types.ObjectId(dailyKhataId),
        bossId: null,
        payerStaffId: null,
        consumerType: 'INDIVIDUAL',
        consumerId: new mongoose.Types.ObjectId(),
        consumerNameSnapshot: 'Legacy Row',
        consumerContextSnapshot: '',
        itemId: new mongoose.Types.ObjectId(comboId),
        itemNameSnapshot: 'Legacy Item',
        unitPricePaisa: 2500,
        businessDate: '2026-09-09',
        quantity: 1,
        totalPaisa: 2500,
        updatedAt: new Date(),
      });

      const daily = await agent.get('/api/consumption/daily?date=2026-09-09');
      const row = daily.body.data.rows.find((r: { consumerName: string }) => r.consumerName === 'Legacy Row');
      expect(row).toBeTruthy();
      expect(row.servingSize).toBe('FULL');
    });
  });
});
