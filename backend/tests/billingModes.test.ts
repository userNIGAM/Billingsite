import request from 'supertest';
import { createApp } from '../app';
import { Staff } from '../models/staff.model';
import { Bill } from '../models/bill.model';

/**
 * The 4-option khata creation system (MASTER PROMPT):
 *   1. INDIVIDUAL — one person, one ledger.
 *   2. OFFICE/DIRECT — the office itself is the payer, no bosses/staff.
 *   3. OFFICE/GROUPS — bosses and their staff only; the office has no ledger.
 *   4. OFFICE/MIXED — office ledger + bosses + staff coexist, isolated.
 * These tests pin the payer-key semantics: (khataId, null, null) is the
 * office's own ledger and must never absorb boss/staff consumption.
 */
describe('billing modes (DIRECT / GROUPS / MIXED)', () => {
  const agent = request.agent(createApp());
  // Must match ADMIN_SETUP_TOKEN from tests/env.setup.ts.
  const SETUP_TOKEN = 'test-setup-token';
  let itemId = '';

  beforeAll(async () => {
    const setup = await agent.post('/api/auth/setup').send({
      setupToken: SETUP_TOKEN,
      name: 'Modes Admin',
      email: 'modes@test.local',
      password: 'Sup3rSecret!',
    });
    expect(setup.status).toBe(201);

    const item = await agent.post('/api/items').send({
      name: 'Modes Tea',
      category: 'Drinks',
      sellingPricePaisa: 2000,
      costPricePaisa: 800,
      unit: 'cup',
    });
    expect(item.status).toBe(201);
    itemId = item.body.data.item._id;
  });

  describe('DIRECT office', () => {
    let officeId = '';

    it('bills, pays and folds the office opening exactly once via the office ledger', async () => {
      const res = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Direct Office',
        startDate: '2026-01-01',
        billingStartDay: 1,
        billingMode: 'DIRECT',
        openingBalancePaisa: 4000,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.khata.billingMode).toBe('DIRECT');
      expect(res.body.data.defaultBossId).toBeNull();
      officeId = res.body.data.khata._id;

      const order = await agent.post('/api/consumption').send({
        consumerType: 'OFFICE',
        consumerId: officeId,
        itemId,
        quantity: 2,
        businessDate: '2026-04-05',
      });
      expect(order.status).toBe(201);

      // No bossId/staffId: this bill targets the (khataId, null, null) key.
      const billRes = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
      });
      expect(billRes.status).toBe(201);
      const bill = billRes.body.data.bill;
      expect(bill.scope).toBe('OFFICE');
      expect(bill.bossId).toBeNull();
      expect(bill.staffId).toBeNull();
      expect(bill.consumptionTotalPaisa).toBe(4000);
      // Opening (4000) folded into the FIRST bill only.
      expect(bill.previousDuePaisa).toBe(4000);
      expect(bill.duePaisa).toBe(8000);

      // Second period: opening must not reappear.
      await agent.post('/api/consumption').send({
        consumerType: 'OFFICE',
        consumerId: officeId,
        itemId,
        quantity: 1,
        businessDate: '2026-05-05',
      });
      const second = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      });
      expect(second.status).toBe(201);
      expect(second.body.data.bill.previousDuePaisa).toBe(8000);
      expect(second.body.data.bill.duePaisa).toBe(10000);

      // Pay the office ledger directly (no bossId/staffId).
      const payRes = await agent.post('/api/payments').send({
        khataId: officeId,
        amountPaisa: 8000,
        method: 'CASH',
        paymentDate: '2026-05-10',
      });
      expect(payRes.status).toBe(201);
      expect(payRes.body.data.payment.bossId).toBeNull();
      expect(payRes.body.data.payment.staffId).toBeNull();
    });

    it('rejects creating bosses or staff, and rejects a DIRECT transition onto an office that has them', async () => {
      const bossRes = await agent
        .post(`/api/bosses/offices/${officeId}/bosses`)
        .send({ khataId: officeId, name: 'Nope Boss', startDate: '2026-01-01' });
      expect(bossRes.status).toBe(422);

      const staffRes = await agent.post('/api/staff').send({
        khataId: officeId,
        name: 'Nope Staff',
        startDate: '2026-01-01',
      });
      expect(staffRes.status).toBe(422);

      const creation = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Bad Direct Office',
        startDate: '2026-01-01',
        billingMode: 'DIRECT',
        initialBosses: [{ name: 'Sneaky Boss' }],
      });
      expect(creation.status).toBe(422);

      // MIXED office WITH bosses cannot switch to DIRECT either.
      const mixed = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Transition Office',
        startDate: '2026-01-01',
        billingMode: 'MIXED',
        initialBosses: [{ name: 'Staying Boss' }],
      });
      expect(mixed.status).toBe(201);
      const transition = await agent
        .patch(`/api/khatas/${mixed.body.data.khata._id}`)
        .send({ billingMode: 'DIRECT' });
      expect(transition.status).toBe(422);
    });
  });

  describe('GROUPS office', () => {
    let officeId = '';
    let bossId = '';

    it('requires a boss for billing and payments; the office ledger is disabled', async () => {
      const creation = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Groups Office',
        startDate: '2026-01-01',
        billingStartDay: 1,
        billingMode: 'GROUPS',
        initialBosses: [{ name: 'Group Boss', openingBalancePaisa: 3000 }],
      });
      expect(creation.status).toBe(201);
      officeId = creation.body.data.khata._id;
      const bossesRes = await agent.get(`/api/bosses/offices/${officeId}/bosses`);
      bossId = bossesRes.body.data.bosses[0]._id;

      // No bossId: BOSS_REQUIRED — a GROUPS office has no ledger of its own.
      const noBossBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });
      expect(noBossBill.status).toBe(400);
      expect(noBossBill.body.code).toBe('BOSS_REQUIRED');

      const noBossPay = await agent.post('/api/payments').send({
        khataId: officeId,
        amountPaisa: 100,
        method: 'CASH',
        paymentDate: '2026-01-15',
      });
      expect(noBossPay.status).toBe(400);
      expect(noBossPay.body.code).toBe('BOSS_REQUIRED');

      // The office itself cannot be picked as an OFFICE consumer.
      const consumer = await agent.post('/api/consumption').send({
        consumerType: 'OFFICE',
        consumerId: officeId,
        itemId,
        quantity: 1,
      });
      expect(consumer.status).toBe(409);
      expect(consumer.body.code).toBe('OFFICE_LEDGER_DISABLED');

      // Boss billing still works, carrying the boss's own opening once.
      await agent.post('/api/consumption').send({
        consumerType: 'BOSS',
        consumerId: bossId,
        itemId,
        quantity: 1,
        businessDate: '2026-01-10',
      });
      const bossBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        bossId,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });
      expect(bossBill.status).toBe(201);
      expect(bossBill.body.data.bill.scope).toBe('BOSS_GROUP');
      expect(bossBill.body.data.bill.previousDuePaisa).toBe(3000);
    });

    it('rejects an opening balance on the office and a boss-less staff member', async () => {
      const withOpening = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Groups With Opening',
        startDate: '2026-01-01',
        billingMode: 'GROUPS',
        openingBalancePaisa: 100,
      });
      expect(withOpening.status).toBe(422);

      const staffRes = await agent.post('/api/staff').send({
        khataId: officeId,
        name: 'Bossless Groups Staff',
        startDate: '2026-01-01',
      });
      expect(staffRes.status).toBe(422);

      // Switching GROUPS -> DIRECT is fine here: no staff exist yet, but the
      // office would gain a ledger; switching to MIXED is also fine.
      const toMixed = await agent.patch(`/api/khatas/${officeId}`).send({ billingMode: 'MIXED' });
      expect(toMixed.status).toBe(200);
    });
  });

  describe('MIXED office ledger isolation', () => {
    let officeId = '';
    let bossId = '';

    it('keeps office, boss and staff ledgers separate end to end', async () => {
      const res = await agent.post('/api/khatas').send({
        type: 'OFFICE',
        displayName: 'Mixed Iso Office',
        startDate: '2026-01-01',
        billingStartDay: 1,
        billingMode: 'MIXED',
        openingBalancePaisa: 500,
        initialBosses: [{ name: 'Iso Boss' }],
        initialStaff: [{ name: 'Iso Bossless Self Staff', billingResponsibility: 'SELF', openingBalancePaisa: 1500 }],
      });
      expect(res.status).toBe(201);
      officeId = res.body.data.khata._id;
      const bossesRes = await agent.get(`/api/bosses/offices/${officeId}/bosses`);
      bossId = bossesRes.body.data.bosses[0]._id;
      const staffRes = await agent.get(`/api/staff?khataId=${officeId}`);
      const staffRow = staffRes.body.data.rows.find((r: { name: string }) => r.name === 'Iso Bossless Self Staff');
      expect(staffRow.bossId).toBeNull();

      // Office order via the OFFICE consumer type.
      await agent.post('/api/consumption').send({
        consumerType: 'OFFICE',
        consumerId: officeId,
        itemId,
        quantity: 1,
        businessDate: '2026-06-05',
      });
      // Boss order.
      await agent.post('/api/consumption').send({
        consumerType: 'BOSS',
        consumerId: bossId,
        itemId,
        quantity: 2,
        businessDate: '2026-06-05',
      });
      // Boss-less SELF staff order bills the staff's own ledger.
      await agent.post('/api/consumption').send({
        consumerType: 'STAFF',
        consumerId: staffRow._id,
        itemId,
        quantity: 3,
        businessDate: '2026-06-05',
      });

      const officeBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
      });
      expect(officeBill.status).toBe(201);
      // Only the office's own 1x2000 order — never the boss's or staff's.
      expect(officeBill.body.data.bill.scope).toBe('OFFICE');
      expect(officeBill.body.data.bill.consumptionTotalPaisa).toBe(2000);
      expect(officeBill.body.data.bill.previousDuePaisa).toBe(500);

      const bossBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        bossId,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
      });
      expect(bossBill.status).toBe(201);
      expect(bossBill.body.data.bill.consumptionTotalPaisa).toBe(4000);
      expect(bossBill.body.data.bill.previousDuePaisa).toBe(0);

      const staffBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        staffId: staffRow._id,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
      });
      expect(staffBill.status).toBe(201);
      expect(staffBill.body.data.bill.scope).toBe('STAFF');
      expect(staffBill.body.data.bill.bossId).toBeNull();
      expect(staffBill.body.data.bill.consumptionTotalPaisa).toBe(6000);
      expect(staffBill.body.data.bill.previousDuePaisa).toBe(1500);
    });

    it('lets a staff member transfer into the office pool without moving old debts', async () => {
      const staffRes = await agent.get(`/api/staff?khataId=${officeId}`);
      const staffRow = staffRes.body.data.rows.find((r: { name: string }) => r.name === 'Iso Bossless Self Staff');

      // Give the staff a boss first, bill them there, then transfer to pool.
      const transferToBoss = await agent
        .patch(`/api/staff/${staffRow._id}/transfer`)
        .send({ bossId });
      expect(transferToBoss.status).toBe(200);

      await agent.post('/api/consumption').send({
        consumerType: 'STAFF',
        consumerId: staffRow._id,
        itemId,
        quantity: 1,
        businessDate: '2026-06-20',
      });
      const underBossBill = await agent.post('/api/bills/generate').send({
        khataId: officeId,
        staffId: staffRow._id,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
      });
      // A personal ledger already exists (June 5 bill), so a new bill for the
      // later order carries only the unpaid prior due, not the boss's group.
      expect(underBossBill.status).toBe(201);
      expect(underBossBill.body.data.bill.scope).toBe('STAFF');
      expect(underBossBill.body.data.bill.consumptionTotalPaisa).toBe(2000);

      // Transfer into the office pool (bossId null).
      const toPool = await agent
        .patch(`/api/staff/${staffRow._id}/transfer`)
        .send({ bossId: null });
      expect(toPool.status).toBe(200);
      const updated = await Staff.findById(staffRow._id).lean();
      expect(updated!.bossId).toBeNull();

      // Historical bills keep the boss they were billed under (E-5): the old
      // staff bill's snapshot is untouched, and the boss's own group due did
      // not absorb any of the staff's debts.
      const oldBill = await Bill.findOne({ staffId: staffRow._id, isVoided: false }).lean();
      expect(oldBill).toBeTruthy();
      const bossBills = await Bill.find({ bossId, staffId: null, isVoided: false }).lean();
      for (const b of bossBills) {
        expect(b.consumptionTotalPaisa).toBe(4000);
      }
    });
  });
});
