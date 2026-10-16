import request from 'supertest';
import { createApp } from '../app';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { Boss } from '../models/boss.model';

const agent = request.agent(createApp());

const SETUP_TOKEN = 'test-setup-token';

function expectEnvelope(res: request.Response) {
  expect(res.body.success).toBe(true);
  return res.body.data;
}

describe('Canteen Khata API — end to end', () => {
  let individualKhataId = '';
  let officeKhataId = '';
  let extraBossId = '';
  let staffId = '';
  let itemId = ''; // Rs 60 item

  beforeAll(async () => {
    // First-time setup admin
    const setupRes = await agent.post('/api/auth/setup').send({
      setupToken: SETUP_TOKEN,
      name: 'Test Admin',
      email: 'admin@test.local',
      password: 'Sup3rSecret!',
    });
    expect(setupRes.status).toBe(201);

    // Setup is idempotent-guarded: a second admin cannot be created.
    const dupRes = await request(createApp()).post('/api/auth/setup').send({
      setupToken: SETUP_TOKEN,
      name: 'Bad Admin',
      email: 'bad@test.local',
      password: 'Sup3rSecret!',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe('SETUP_COMPLETE');

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.admin.email).toBe('admin@test.local');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(createApp()).get('/api/khatas');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('creates an INDIVIDUAL khata with a friendly code', async () => {
    const res = await agent.post('/api/khatas').send({
      type: 'INDIVIDUAL',
      displayName: 'Prakash Shrestha',
      phone: '9800000001',
      address: 'Kathmandu',
      startDate: '2026-01-01',
      billingStartDay: 1,
      openingBalancePaisa: 5000,
    });
    expect(res.status).toBe(201);
    const khata = expectEnvelope(res).khata;
    expect(khata.khataCode).toMatch(/^KH-\d{6}$/);
    individualKhataId = khata._id;
  });

  it('creates an OFFICE khata with an auto "Office Direct" boss', async () => {
    const res = await agent.post('/api/khatas').send({
      type: 'OFFICE',
      displayName: 'Himalaya Hotel',
      startDate: '2026-01-01',
      billingStartDay: 1,
    });
    expect(res.status).toBe(201);
    const result = expectEnvelope(res);
    expect(result.khata.type).toBe('OFFICE');
    officeKhataId = result.khata._id;

    const bossesRes = await agent.get(`/api/bosses/offices/${officeKhataId}/bosses`);
    expect(bossesRes.status).toBe(200);
    const bosses = expectEnvelope(bossesRes).bosses;
    expect(bosses).toHaveLength(1);
    expect(bosses[0].isDefault).toBe(true);
  });

  it('adds a boss and staff to the office', async () => {
    const bossRes = await agent.post(`/api/bosses/offices/${officeKhataId}/bosses`).send({
      khataId: officeKhataId,
      name: 'Ram Bahadur',
      phone: '9800000002',
      startDate: '2026-01-01',
    });
    expect(bossRes.status).toBe(201);
    extraBossId = expectEnvelope(bossRes).boss._id;

    const staffRes = await agent.post('/api/staff').send({
      khataId: officeKhataId,
      bossId: extraBossId,
      name: 'Kumar Rai',
      startDate: '2026-01-01',
    });
    expect(staffRes.status).toBe(201);
    staffId = expectEnvelope(staffRes).staff._id;
  });

  it('creates items and blocks selling-price edits that break history', async () => {
    const res1 = await agent.post('/api/items').send({
      name: 'Plain Rice',
      category: 'Food',
      sellingPricePaisa: 6000,
      costPricePaisa: 3500,
      unit: 'plate',
    });
    expect(res1.status).toBe(201);
    itemId = expectEnvelope(res1).item._id;

    const res2 = await agent.post('/api/items').send({
      name: 'Daal Bhat',
      category: 'Food',
      sellingPricePaisa: 10000,
      costPricePaisa: 5500,
      unit: 'plate',
    });
    expect(res2.status).toBe(201);
  });

  it('creates an office with mixed staff billing and keeps personal staff bills separate', async () => {
    const officeRes = await agent.post('/api/khatas').send({
      type: 'OFFICE',
      displayName: 'Mixed Billing Office',
      startDate: '2026-01-01',
      billingStartDay: 1,
      defaultStaffBillingResponsibility: 'SELF',
      initialBoss: { name: 'Accounts Team' },
      initialStaff: [
        { name: 'Personally Billed Staff' },
        { name: 'Office Billed Staff', billingResponsibility: 'OFFICE' },
      ],
    });
    expect(officeRes.status).toBe(201);
    const officeId = officeRes.body.data.khata._id as string;
    const staffRes = await agent.get(`/api/staff?khataId=${officeId}`);
    expect(staffRes.status).toBe(200);
    const staffRows = staffRes.body.data.rows as Array<{
      _id: string;
      name: string;
      bossId: string;
      billingResponsibility: 'OFFICE' | 'SELF';
    }>;
    const personallyBilled = staffRows.find((row) => row.name === 'Personally Billed Staff')!;
    const officeBilled = staffRows.find((row) => row.name === 'Office Billed Staff')!;
    expect(personallyBilled.billingResponsibility).toBe('SELF');
    expect(officeBilled.billingResponsibility).toBe('OFFICE');
    expect(personallyBilled.bossId).toBe(officeBilled.bossId);

    for (const staff of [personallyBilled, officeBilled]) {
      const order = await agent.post('/api/consumption').send({
        consumerType: 'STAFF',
        consumerId: staff._id,
        itemId,
        quantity: 1,
        businessDate: '2026-03-10',
      });
      expect(order.status).toBe(201);
    }

    const changeResponsibility = await agent.patch(`/api/staff/${personallyBilled._id}`).send({
      billingResponsibility: 'OFFICE',
    });
    expect(changeResponsibility.status).toBe(200);
    const futureOfficeOrder = await agent.post('/api/consumption').send({
      consumerType: 'STAFF',
      consumerId: personallyBilled._id,
      itemId,
      quantity: 1,
      businessDate: '2026-03-11',
    });
    expect(futureOfficeOrder.status).toBe(201);

    const staffBillRes = await agent.post('/api/bills/generate').send({
      khataId: officeId,
      staffId: personallyBilled._id,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    });
    expect(staffBillRes.status).toBe(201);
    expect(staffBillRes.body.data.bill.scope).toBe('STAFF');
    expect(staffBillRes.body.data.bill.payerNameSnapshot).toBe('Mixed Billing Office — Personally Billed Staff');
    expect(staffBillRes.body.data.bill.consumptionTotalPaisa).toBe(6000);

    const officeBillRes = await agent.post('/api/bills/generate').send({
      khataId: officeId,
      bossId: personallyBilled.bossId,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    });
    expect(officeBillRes.status).toBe(201);
    expect(officeBillRes.body.data.bill.consumptionTotalPaisa).toBe(12000);

    const staffPayment = await agent.post('/api/payments').send({
      khataId: officeId,
      staffId: personallyBilled._id,
      amountPaisa: 6000,
      method: 'CASH',
      paymentDate: '2026-03-15',
    });
    expect(staffPayment.status).toBe(201);
    expect(staffPayment.body.data.payment.staffId).toBe(personallyBilled._id);

    const staffSummary = await agent.get(`/api/staff/${personallyBilled._id}/summary`);
    const bossSummary = await agent.get(`/api/bosses/${personallyBilled.bossId}/summary`);
    expect(staffSummary.status).toBe(200);
    expect(staffSummary.body.data.duePaisa).toBe(0);
    expect(bossSummary.status).toBe(200);
    expect(bossSummary.body.data.duePaisa).toBe(12000);
  });

  it('records consumption and aggregates it into the daily cell', async () => {
    const res = await agent.post('/api/consumption').send({
      consumerType: 'INDIVIDUAL',
      consumerId: individualKhataId,
      itemId,
      quantity: 2,
      businessDate: '2026-01-15',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.transaction.totalPaisa).toBe(12000);

    // Same consumer + item + day + price: idempotent upsert on the cell.
    await agent.post('/api/consumption').send({
      consumerType: 'INDIVIDUAL',
      consumerId: individualKhataId,
      itemId,
      quantity: 1,
      businessDate: '2026-01-15',
    });

    const cell = await DailyConsumption.findOne({
      consumerId: individualKhataId,
      businessDate: '2026-01-15',
      itemId,
    });
    expect(cell).not.toBeNull();
    expect(cell!.quantity).toBe(3);
    expect(cell!.totalPaisa).toBe(18000);

    const daily = await agent.get('/api/consumption/daily').query({ date: '2026-01-15' });
    expect(daily.status).toBe(200);
    expect(daily.body.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: String(cell!._id),
          consumerId: individualKhataId,
          itemId,
        }),
      ])
    );
  });

  it('voiding a consumption appends a REVERSAL and nets the cell', async () => {
    const tx = await ConsumptionTransaction.findOne({
      consumerId: individualKhataId,
      businessDate: '2026-01-15',
      itemId,
      quantity: 2,
    });
    expect(tx).not.toBeNull();

    const res = await agent.patch(`/api/consumption/${tx!._id}/void`).send({ reason: 'Wrong item entered' });
    expect(res.status).toBe(200);

    const original = await ConsumptionTransaction.findById(tx!._id).lean();
    expect(original!.entryType).toBe('ORDER');
    // The ORDER is marked VOIDED. Leaving it ACTIVE let the same row be
    // reversed repeatedly, each void appending another negative REVERSAL and
    // driving the daily cell negative while bills still reported the pre-void
    // total (reports filter quantity > 0, so the corruption stayed invisible).
    expect(original!.status).toBe('VOIDED');

    // Regression guard for the repeat-void hole the status write closes.
    const again = await agent.patch(`/api/consumption/${tx!._id}/void`).send({ reason: 'Again' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_VOIDED');

    const reversal = await ConsumptionTransaction.findOne({
      consumerId: individualKhataId,
      businessDate: '2026-01-15',
      itemId,
      entryType: 'REVERSAL',
    });
    expect(reversal).not.toBeNull();
    expect(reversal!.quantity).toBe(-2);

    // Exactly one reversal, not two.
    expect(
      await ConsumptionTransaction.countDocuments({
        consumerId: individualKhataId,
        itemId,
        entryType: 'REVERSAL',
      })
    ).toBe(1);

    const cell = await DailyConsumption.findOne({
      consumerId: individualKhataId,
      businessDate: '2026-01-15',
      itemId,
    });
    expect(cell!.quantity).toBe(1); // 3 − 2
  });

  it('generates a bill that freezes line items for the period (2026-01-01 → 2026-01-31)', async () => {
    const res = await agent.post('/api/bills/generate').send({
      khataId: individualKhataId,
      bossId: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(res.status).toBe(201);
    const bill = res.body.data.bill;
    expect(bill.billNumber).toMatch(/^INV-2026-\d{6}$/);

    // The single surviving line = 1 × Rs 60.
    expect(bill.lineItems).toHaveLength(1);
    expect(bill.lineItems[0].quantity).toBe(1);
    expect(bill.lineItems[0].unitPricePaisa).toBe(6000);
    expect(bill.consumptionTotalPaisa).toBe(6000);

    // Opening balance (Rs 50) carries forward.
    expect(bill.previousDuePaisa).toBe(5000);
    expect(bill.totalPayablePaisa).toBe(11000);
    expect(bill.status).toBe('UNPAID');
  });

  it('rejects an overlapping bill for the same payer with 409 BILL_ALREADY_EXISTS', async () => {
    const res = await agent.post('/api/bills/generate').send({
      khataId: individualKhataId,
      bossId: null,
      periodStart: '2026-01-15',
      periodEnd: '2026-01-20',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BILL_ALREADY_EXISTS');
  });

  it('records a partial payment allocated FIFO to the oldest bill', async () => {
    const res = await agent.post('/api/payments').send({
      khataId: individualKhataId,
      bossId: null,
      amountPaisa: 5000,
      method: 'CASH',
      paymentDate: '2026-01-20',
      reference: 'cash-drop-1',
    });
    expect(res.status).toBe(201);

    const bill = await Bill.findOne({ khataId: individualKhataId }).lean();
    expect(bill!.paidPaisa).toBe(5000);
    expect(bill!.duePaisa).toBe(6000);
    expect(bill!.status).toBe('PARTIALLY_PAID');

    const payment = await Payment.findOne({ reference: 'cash-drop-1' }).lean();
    expect(payment!.allocations[0].amountPaisa).toBe(5000);
  });

  it('overpaying creates credit that the next bill generation consumes', async () => {
    // Rs 130 advance → Rs 60 goes to the open bill, Rs 70 becomes credit.
    const overRes = await agent.post('/api/payments').send({
      khataId: individualKhataId,
      bossId: null,
      amountPaisa: 13000,
      method: 'DIGITAL',
      digitalChannel: 'ESEWA',
      paymentDate: '2026-02-01',
      reference: 'advance-1',
    });
    expect(overRes.status).toBe(201);
    const advance = await Payment.findOne({ reference: 'advance-1' }).lean();
    expect(advance!.unallocatedPaisa).toBe(7000);

    // Consumption inside the next period (2026-02-01 → 2026-02-28).
    await agent.post('/api/consumption').send({
      consumerType: 'INDIVIDUAL',
      consumerId: individualKhataId,
      itemId,
      quantity: 2,
      businessDate: '2026-02-10',
    });

    const genRes = await agent.post('/api/bills/generate').send({
      khataId: individualKhataId,
      bossId: null,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
    });
    expect(genRes.status).toBe(201);
    const bill = genRes.body.data.bill;
    expect(bill.previousDuePaisa).toBe(0);
    expect(bill.creditAppliedPaisa).toBe(7000);
    expect(bill.consumptionTotalPaisa).toBe(12000);
    expect(bill.totalPayablePaisa).toBe(5000); // 12000 − 7000 credit
    expect(bill.status).toBe('UNPAID');
  });

  it('voiding the advance payment restores the second bill to its full amount', async () => {
    const advance = await Payment.findOne({ reference: 'advance-1' }).lean();
    const res = await agent.post(`/api/payments/${advance!._id}/void`).send({ reason: 'Wrong reference entered' });
    expect(res.status).toBe(200);

    const bill = await Bill.findOne({ khataId: individualKhataId, periodStart: '2026-02-01' }).lean();
    expect(bill!.totalPayablePaisa).toBe(12000);
    expect(bill!.paidPaisa).toBe(0);

    const voidedPayment = await Payment.findById(advance!._id).lean();
    expect(voidedPayment!.isVoided).toBe(true);
    expect(voidedPayment!.allocations).toHaveLength(0);

    // The credit is gone, so the bill can no longer be partially covered by it.
    expect(bill!.status).toBe('UNPAID');
  });

  it('staff consumption routes into its boss billing group', async () => {
    await agent.post('/api/consumption').send({
      consumerType: 'STAFF',
      consumerId: staffId,
      itemId,
      quantity: 1,
      businessDate: '2026-02-10',
    });

    const genRes = await agent.post('/api/bills/generate').send({
      khataId: officeKhataId,
      bossId: extraBossId,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
    });
    expect(genRes.status).toBe(201);
    const bill = genRes.body.data.bill;
    expect(bill.payerNameSnapshot).toContain('Ram Bahadur');
    expect(bill.consumptionTotalPaisa).toBe(6000);
  });

  it('customer search finds khatas and excludes offline ones by default', async () => {
    // Active search
    const search = await agent.get(`/api/customers/search?q=prakash`);
    expect(search.status).toBe(200);
    const customers = search.body.data.customers;
    expect(customers.length).toBeGreaterThan(0);
    expect(customers[0].name.toLowerCase()).toContain('prakash');

    const officeSearch = await agent.get('/api/customers/search?q=himalaya');
    expect(officeSearch.status).toBe(200);
    expect(officeSearch.body.data.customers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consumerType: 'BOSS',
          consumerId: expect.any(String),
          name: 'Himalaya Hotel',
          isOfficeDirect: true,
        }),
      ])
    );

    // Take the office offline, then its bosses must disappear from default search.
    await agent.patch(`/api/khatas/${officeKhataId}/status`).send({ status: 'OFFLINE' });

    const offlineSearch = await agent.get(`/api/customers/search?q=ram`);
    expect(offlineSearch.body.data.customers.length).toBe(0);

    const withOffline = await agent.get(`/api/customers/search?q=ram&includeOffline=true`);
    expect(withOffline.body.data.customers.length).toBeGreaterThan(0);

    const boss = await Boss.findById(extraBossId).lean();
    expect(boss!.status).toBe('INACTIVE');
  });

  it('expense categories + expenses integrate with the envelope', async () => {
    const catRes = await agent.post('/api/expense-categories').send({ name: 'Test Supplies' });
    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.data.category._id;

    const expRes = await agent.post('/api/expenses').send({
      categoryId,
      itemName: 'Gloves',
      quantity: 10,
      unit: 'pair',
      amountPaisa: 15000,
      supplier: 'KTM Wholesale',
      businessDate: '2026-02-10',
      paymentMethod: 'CASH',
      note: 'Test expense',
    });
    expect(expRes.status).toBe(201);

    const listRes = await agent.get('/api/expenses').send();
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.rows).toHaveLength(1);
    expect(listRes.body.data.rows[0].amountPaisa).toBe(15000);
  });

  it('reports endpoints return data for seeded windows', async () => {
    const sales = await agent.get('/api/reports/sales?from=2026-01-01&to=2026-02-28&groupBy=day');
    expect(sales.status).toBe(200);
    expect(sales.body.data.totalSalesPaisa).toBeGreaterThan(0);
    expect(Array.isArray(sales.body.data.groups)).toBe(true);

    const customers = await agent.get('/api/reports/customers');
    expect(customers.status).toBe(200);
    expect(customers.body.data.rows.length).toBeGreaterThanOrEqual(2);

    const dashboard = await agent.get('/api/dashboard/overview');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.outstandingDuesPaisa).toBeGreaterThan(0);
    expect(typeof dashboard.body.data.monthSalesPaisa).toBe('number');
  });

  it('settings profile can be read and updated', async () => {
    const read = await agent.get('/api/settings/profile');
    expect(read.status).toBe(200);
    expect(read.body.data.profile).toEqual(expect.objectContaining({
      name: expect.any(String),
      address: expect.any(String),
      phone: expect.any(String),
      panNumber: expect.any(String),
      billingNote: expect.any(String),
    }));
    expect(read.body.data.profile.name).toBe('');

    const update = await agent.patch('/api/settings/profile').send({
      name: 'Khaja Ghar',
      address: 'Bharatpur',
      phone: '9800000000',
      panNumber: '123456789',
      billingNote: 'Please bring exact change.',
    });
    expect(update.status).toBe(200);
    expect(update.body.data.profile.name).toBe('Khaja Ghar');
    expect(update.body.data.profile.panNumber).toBe('123456789');
    expect(update.body.data.profile.billingNote).toBe('Please bring exact change.');

    const invalidPan = await agent.patch('/api/settings/profile').send({ panNumber: '12345' });
    expect(invalidPan.status).toBe(422);

    const persisted = await agent.get('/api/settings/profile');
    expect(persisted.body.data.profile).toEqual({
      name: 'Khaja Ghar',
      address: 'Bharatpur',
      phone: '9800000000',
      panNumber: '123456789',
      billingNote: 'Please bring exact change.',
    });
  });

  it('audit logs record financially meaningful actions', async () => {
    const res = await agent.get('/api/reports/audit-logs?limit=100');
    expect(res.status).toBe(200);
    const logs = res.body.data;
    expect(logs.length).toBeGreaterThan(0);

    // Each action is asserted through its own filtered query rather than
    // scanning one page. `findAuditLogs` sorts by createdAt desc, so by the
    // time this test runs the KHATA_CREATED rows are far outside a page of 10
    // — a single-page scan asserted nothing about whether the audit trail
    // recorded the event at all.
    const actionsFor = async (entity: string) => {
      const page = await agent.get(`/api/reports/audit-logs?entity=${entity}&limit=100`);
      expect(page.status).toBe(200);
      return new Set(page.body.data.map((l: { action: string }) => l.action));
    };

    expect((await actionsFor('Khata')).has('KHATA_CREATED')).toBe(true);
    expect((await actionsFor('Bill')).has('BILL_GENERATED')).toBe(true);
    expect((await actionsFor('Bill')).has('BILL_VOIDED')).toBe(false);
  });
});