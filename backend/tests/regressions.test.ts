import request from "supertest";
import { createApp } from "../app";
import { Bill } from "../models/bill.model";
import { Payment } from "../models/payment.model";
import { ConsumptionTransaction } from "../models/consumptionTransaction.model";
import { DailyConsumption } from "../models/dailyConsumption.model";
import { Boss } from "../models/boss.model";
import { Khata } from "../models/khata.model";
import { periodContaining } from "../services/period.service";
import { runInTransaction } from "../utils/transaction";

/**
 * Regression tests for defects found while bringing the integration suite
 * green. Each test here pins a bug that shipped past review, so they are
 * deliberately narrow and assert on persisted state rather than on status
 * codes alone — most of these holes returned a perfectly plausible 2xx.
 */
describe("regressions", () => {
  const agent = request.agent(createApp());
  // Must match ADMIN_SETUP_TOKEN from tests/env.setup.ts.
  const SETUP_TOKEN = "test-setup-token";

  let individualKhataId = "";
  let officeKhataId = "";
  let bossId = "";
  let itemId = "";

  beforeAll(async () => {
    const setup = await agent.post("/api/auth/setup").send({
      setupToken: SETUP_TOKEN,
      name: "Regression Admin",
      email: "regression@test.local",
      password: "Sup3rSecret!",
    });
    expect(setup.status).toBe(201);

    const khata = await agent.post("/api/khatas").send({
      type: "INDIVIDUAL",
      displayName: "Repeat Individual",
      startDate: "2026-01-01",
      billingStartDay: 1,
      // Migrated paper dues. Without this the balance is uncollectable: see
      // "carries migrated paper dues onto the first bill" below.
      openingBalancePaisa: 5000,
    });
    individualKhataId = khata.body.data.khata._id;

    const office = await agent.post("/api/khatas").send({
      type: "OFFICE",
      displayName: "Regression Office",
      startDate: "2026-01-01",
      billingStartDay: 1,
    });
    officeKhataId = office.body.data.khata._id;

    const boss = await agent
      .post(`/api/bosses/offices/${officeKhataId}/bosses`)
      .send({
        khataId: officeKhataId,
        name: "Rameshwar Prasad",
        startDate: "2026-01-01",
      });
    bossId = boss.body.data.boss._id;

    const item = await agent.post("/api/items").send({
      name: "Regression Rice",
      category: "Food",
      sellingPricePaisa: 6000,
      costPricePaisa: 3500,
      unit: "plate",
    });
    itemId = item.body.data.item._id;
  });

  describe("transaction fallback", () => {
    it("runInTransaction still executes the callback with a null session on standalone", async () => {
      let observed: unknown = "not-called";

      const result = await runInTransaction(
        async (session: import("mongoose").ClientSession | null) => {
          observed = session;
          return "ok";
        }
      );

      expect(result).toBe("ok");
      expect(observed === null || typeof observed === "object").toBe(true);
    });
  });

  describe("empty startup dashboard", () => {
    it("returns live zero totals and no estimated profit before any sales exist", async () => {
      const response = await agent.get("/api/dashboard/overview");

      expect(response.status).toBe(200);
      expect(response.body.data.todaySalesPaisa).toBe(0);
      expect(response.body.data.monthSalesPaisa).toBe(0);
      expect(response.body.data.outstandingDuesPaisa).toBe(5000);
      expect(response.body.data.profitLoss.grossProfitEstimated).toBe(false);
      expect(response.body.data.topItems).toEqual([]);
      expect(
        response.body.data.salesExpenseSeries.every(
          (point: { salesPaisa: number; expensePaisa: number }) =>
            point.salesPaisa === 0 && point.expensePaisa === 0,
        ),
      ).toBe(true);
    });
  });

  describe("billing periods", () => {
    it("returns valid periods and skips periods before the khata starts", () => {
      expect(periodContaining(15, "2026-07-03", null, "2026-07-01")).toEqual({
        periodStart: "2026-07-03",
        periodEnd: "2026-07-14",
      });
      expect(periodContaining(15, "2026-07-03", null, "2026-06-01")).toBeNull();
    });

    it("bills the period that was requested rather than rewinding to the khata start", async () => {
      await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: individualKhataId,
        itemId,
        quantity: 1,
        businessDate: "2026-03-10",
      });

      const res = await agent.post("/api/bills/generate").send({
        khataId: individualKhataId,
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
      });
      // The inverted clamp used to rewrite 2026-03-01 back to the khata's
      // 2026-01-01 start date, which then collided with the January bill and
      // returned BILL_ALREADY_EXISTS for a period that was never billed.
      expect(res.status).toBe(201);
      expect(res.body.data.bill.periodStart).toBe("2026-03-01");
      expect(res.body.data.bill.periodEnd).toBe("2026-03-31");
    });

    it("rejects a mid-month window that does not overlap any bill", async () => {
      const res = await agent.post("/api/bills/generate").send({
        khataId: individualKhataId,
        periodStart: "2026-04-10",
        periodEnd: "2026-04-20",
      });
      expect(res.status).toBe(422);
    });

    it("reports an overlapping window as 409 even when it is not a billing boundary", async () => {
      const res = await agent.post("/api/bills/generate").send({
        khataId: individualKhataId,
        periodStart: "2026-03-05",
        periodEnd: "2026-03-20",
      });
      // A window that overlaps a real invoice is a conflict, not a malformed
      // request: the money has already been billed.
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BILL_ALREADY_EXISTS");
    });
  });

  describe("migrated paper dues", () => {
    it("carries migrated paper dues onto the first bill only", async () => {
      // A dedicated khata: the suite is sequential, and this khata's FIRST
      // bill must be genuinely first for the assertion to mean anything.
      const khata = await agent.post("/api/khatas").send({
        type: "INDIVIDUAL",
        displayName: "Fresh Opening Balance",
        startDate: "2026-01-01",
        billingStartDay: 1,
        openingBalancePaisa: 5000,
      });
      const freshKhataId = khata.body.data.khata._id;

      await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: freshKhataId,
        itemId,
        quantity: 2,
        businessDate: "2026-05-10",
      });

      const first = await agent.post("/api/bills/generate").send({
        khataId: freshKhataId,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      });
      expect(first.status).toBe(201);
      const firstBill = first.body.data.bill;
      expect(firstBill.consumptionTotalPaisa).toBe(12000);
      expect(firstBill.previousDuePaisa).toBe(5000);
      expect(firstBill.totalPayablePaisa).toBe(17000);

      // The opening now lives inside the first bill, so the khata's due must
      // not add it a second time on top of the bill dues.
      const detail = await agent.get(`/api/khatas/${freshKhataId}`);
      expect(detail.body.data.duePaisa).toBe(17000);

      await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: freshKhataId,
        itemId,
        quantity: 1,
        businessDate: "2026-06-10",
      });
      const second = await agent.post("/api/bills/generate").send({
        khataId: freshKhataId,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      });
      expect(second.status).toBe(201);
      // Only the unpaid carried-forward due, not the opening balance again.
      expect(second.body.data.bill.previousDuePaisa).toBe(17000);
    });

    it("keeps an office opening balance on the office ledger and off every boss bill", async () => {
      const office = await agent.post("/api/khatas").send({
        type: "OFFICE",
        displayName: "Opening Balance Office",
        startDate: "2026-01-01",
        billingStartDay: 1,
        openingBalancePaisa: 9000,
      });
      const officeId = office.body.data.khata._id;
      // The office's own opening lives on the khata itself now — no hidden
      // "Office Direct" boss carries it.
      expect(office.body.data.khata.openingBalancePaisa).toBe(9000);
      expect(office.body.data.defaultBossId).toBeNull();
      const officeDetail = await agent.get(`/api/khatas/${officeId}`);
      expect(officeDetail.body.data.duePaisa).toBe(9000);
      expect(officeDetail.body.data.bosses).toHaveLength(0);

      const bossRes = await agent
        .post(`/api/bosses/offices/${officeId}/bosses`)
        .send({
          khataId: officeId,
          name: "Balanced Boss",
          startDate: "2026-01-01",
        });
      const officeBossId = bossRes.body.data.boss._id;

      await agent.post("/api/consumption").send({
        consumerType: "BOSS",
        consumerId: officeBossId,
        itemId,
        quantity: 1,
        businessDate: "2026-01-10",
      });

      const res = await agent.post("/api/bills/generate").send({
        khataId: officeId,
        bossId: officeBossId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      });
      expect(res.status).toBe(201);
      // The office ledger's opening stays on the office: folding it into one
      // boss's invoice would double-count it against the office total.
      expect(res.body.data.bill.previousDuePaisa).toBe(0);
    });
  });

  describe("office setup with named bosses and staff opening balances", () => {
    it("creates multiple named bosses, assigns staff by bossIndex, and carries a self-billed staff opening balance onto their first bill exactly once", async () => {
      const office = await agent.post("/api/khatas").send({
        type: "OFFICE",
        displayName: "Multi Boss Office",
        startDate: "2026-01-01",
        billingStartDay: 1,
        initialBosses: [{ name: "Hari Bahadur" }, { name: "Gita Devi" }],
        initialStaff: [
          { name: "Boss One Staff", bossIndex: 0 },
          { name: "Self Staff", bossIndex: 1, billingResponsibility: "SELF", openingBalancePaisa: 7000 },
        ],
      });
      expect(office.status).toBe(201);
      const officeId = office.body.data.khata._id as string;

      const bossesRes = await agent.get(`/api/bosses/offices/${officeId}/bosses`);
      const bosses = bossesRes.body.data.bosses as Array<{ _id: string; name: string; isDefault: boolean }>;
      // Only the two named bosses — no hidden "Office Direct" fallback.
      expect(bosses).toHaveLength(2);
      const hari = bosses.find((b) => b.name === "Hari Bahadur")!;
      const gita = bosses.find((b) => b.name === "Gita Devi")!;
      expect(hari).toBeTruthy();
      expect(gita).toBeTruthy();

      const staffRes = await agent.get(`/api/staff?khataId=${officeId}`);
      const rows = staffRes.body.data.rows as Array<{
        _id: string;
        name: string;
        bossId: string;
        billingResponsibility: string;
        openingBalancePaisa: number;
        duePaisa: number;
      }>;
      const bossOne = rows.find((r) => r.name === "Boss One Staff")!;
      const selfStaff = rows.find((r) => r.name === "Self Staff")!;
      expect(bossOne.bossId).toBe(hari._id);
      expect(selfStaff.bossId).toBe(gita._id);
      expect(selfStaff.openingBalancePaisa).toBe(7000);
      // Until the first bill exists the opening balance is the staff's due.
      expect(selfStaff.duePaisa).toBe(7000);

      const billRes = await agent.post("/api/bills/generate").send({
        khataId: officeId,
        staffId: selfStaff._id,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      });
      expect(billRes.status).toBe(201);
      expect(billRes.body.data.bill.previousDuePaisa).toBe(7000);
      expect(billRes.body.data.bill.duePaisa).toBe(7000);

      // Now that the first bill exists the opening balance lives inside it, so
      // the staff list must stop adding it again (no double count).
      const afterRes = await agent.get(`/api/staff?khataId=${officeId}`);
      const afterRows = afterRes.body.data.rows as Array<{ name: string; duePaisa: number }>;
      expect(afterRows.find((r) => r.name === "Self Staff")!.duePaisa).toBe(7000);
    });
  });

  describe("boss opening balance and address", () => {
    it("stores boss address + opening balance, shows the opening as due until the first group bill, then carries it exactly once", async () => {
      const office = await agent.post("/api/khatas").send({
        type: "OFFICE",
        displayName: "Boss Opening Office",
        startDate: "2026-01-01",
        billingStartDay: 1,
        initialBosses: [
          { name: "Ram Bahadur", address: "Baneshwor", openingBalancePaisa: 5000 },
          { name: "Shyam Kumar", openingBalancePaisa: 3000 },
        ],
      });
      expect(office.status).toBe(201);
      const officeId = office.body.data.khata._id as string;

      const bossesRes = await agent.get(`/api/bosses/offices/${officeId}/bosses`);
      const bosses = bossesRes.body.data.bosses as Array<{
        _id: string;
        name: string;
        address: string;
        openingBalancePaisa: number;
        duePaisa: number;
        isDefault: boolean;
      }>;
      const ram = bosses.find((b) => b.name === "Ram Bahadur")!;
      const shyam = bosses.find((b) => b.name === "Shyam Kumar")!;
      expect(ram.address).toBe("Baneshwor");
      expect(ram.openingBalancePaisa).toBe(5000);
      expect(ram.duePaisa).toBe(5000);
      expect(shyam.duePaisa).toBe(3000);
      // No hidden default boss exists to absorb dues (there is no default boss
      // at all), and none of the named bosses' opening leaked into another.
      expect(bosses.find((b) => b.isDefault)?.duePaisa ?? 0).toBe(0);

      const billRes = await agent.post("/api/bills/generate").send({
        khataId: officeId,
        bossId: ram._id,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      });
      expect(billRes.status).toBe(201);
      // Ram's own migrated due lands on his first group bill — and only once.
      expect(billRes.body.data.bill.previousDuePaisa).toBe(5000);
      expect(billRes.body.data.bill.duePaisa).toBe(5000);

      // Shyam's opening is untouched by Ram's bill.
      const afterRes = await agent.get(`/api/bosses/offices/${officeId}/bosses`);
      const afterBosses = afterRes.body.data.bosses as Array<{ name: string; duePaisa: number }>;
      expect(afterBosses.find((b) => b.name === "Ram Bahadur")!.duePaisa).toBe(5000);
      expect(afterBosses.find((b) => b.name === "Shyam Kumar")!.duePaisa).toBe(3000);

      // Editing the boss keeps address + opening balance auditable fields up to date.
      const updateRes = await agent
        .patch(`/api/bosses/${ram._id}`)
        .send({ address: "New Baneshwor", openingBalancePaisa: 6000 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.boss.address).toBe("New Baneshwor");
      expect(updateRes.body.data.boss.openingBalancePaisa).toBe(6000);
    });

    it("stores a staff address and keeps it on the staff list and summary", async () => {
      const office = await agent.post("/api/khatas").send({
        type: "OFFICE",
        displayName: "Staff Address Office",
        startDate: "2026-01-01",
        billingStartDay: 1,
      });
      const officeId = office.body.data.khata._id as string;

      const staffRes = await agent.post("/api/staff").send({
        khataId: officeId,
        name: "Addressed Staff",
        address: "Koteshwor",
        phone: "9800000000",
        billingResponsibility: "SELF",
        openingBalancePaisa: 2000,
        startDate: "2026-01-01",
      });
      expect(staffRes.status).toBe(201);
      const staffId = staffRes.body.data.staff._id as string;

      const listRes = await agent.get(`/api/staff?khataId=${officeId}`);
      const row = (listRes.body.data.rows as Array<{ name: string; address: string }>)
        .find((r) => r.name === "Addressed Staff")!;
      expect(row.address).toBe("Koteshwor");

      const summaryRes = await agent.get(`/api/staff/${staffId}/summary`);
      expect(summaryRes.body.data.staff.address).toBe("Koteshwor");
    });
  });

  describe("payment allocation", () => {
    it("restores advance credit to the payer that overpaid, not every payer on the bill", async () => {
      // A dedicated khata: payments allocate FIFO across every open bill for
      // the payer, so a shared khata would send these to an older invoice and
      // the two allocations would never land on the bill under test.
      const khata = await agent.post("/api/khatas").send({
        type: "INDIVIDUAL",
        displayName: "Split Payment Khata",
        startDate: "2026-01-01",
        billingStartDay: 1,
      });
      const splitKhataId = khata.body.data.khata._id;

      await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: splitKhataId,
        itemId,
        quantity: 1,
        businessDate: "2026-07-10",
      });
      const billRes = await agent.post("/api/bills/generate").send({
        khataId: splitKhataId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      });
      const billId = billRes.body.data.bill._id;
      const due = billRes.body.data.bill.duePaisa;
      const half = Math.floor(due / 2);

      // Two separate payments, both allocated against the same bill.
      const first = await agent.post("/api/payments").send({
        khataId: splitKhataId,
        amountPaisa: half,
        method: "CASH",
        paymentDate: "2026-07-15",
        reference: "split-a",
      });
      const second = await agent.post("/api/payments").send({
        khataId: splitKhataId,
        amountPaisa: due - half,
        method: "CASH",
        paymentDate: "2026-07-15",
        reference: "split-b",
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      // Both hold an allocation on the one bill.
      const bill = await Bill.findById(billId).lean();
      expect(bill!.paidPaisa).toBe(due);
      const withAllocs = await Payment.find({
        "allocations.billId": billId,
      }).lean();
      expect(withAllocs).toHaveLength(2);

      const voidRes = await agent
        .post(`/api/bills/${billId}/void`)
        .send({ reason: "Wrong period" });
      expect(voidRes.status).toBe(200);
      // Released credit is the sum across BOTH payments.
      expect(voidRes.body.data.releasedCreditPaisa).toBe(due);

      const a = await Payment.findOne({ reference: "split-a" }).lean();
      const b = await Payment.findOne({ reference: "split-b" }).lean();
      // Each is owed exactly what it allocated. The old updateMany + $inc
      // credited the combined total to every matched payment, so a Rs 6000
      // bill split 3000/3000 would hand back Rs 6000 to each — inventing
      // Rs 6000 of credit out of nothing.
      expect(a!.unallocatedPaisa).toBe(half);
      expect(b!.unallocatedPaisa).toBe(due - half);
      expect(a!.allocations).toHaveLength(0);
      expect(b!.allocations).toHaveLength(0);
    });
  });

  describe("consumption voids", () => {
    it("refuses a second void and leaves exactly one reversal", async () => {
      const order = await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: individualKhataId,
        itemId,
        quantity: 3,
        businessDate: "2026-08-12",
      });
      expect(order.status).toBe(201);
      // From the create response, not a findOne: the list path is paginated, so
      // a lookup by consumer+date can miss the row. The response must carry a
      // usable handle — PATCH /consumption/:id/void takes the document id.
      const txId = order.body.data.transaction._id;
      expect(txId).toBeDefined();
      expect(order.body.data.transaction.transactionCode).toEqual(
        expect.any(String),
      );

      const first = await agent
        .patch(`/api/consumption/${txId}/void`)
        .send({ reason: "typo" });
      expect(first.status).toBe(200);
      const second = await agent
        .patch(`/api/consumption/${txId}/void`)
        .send({ reason: "typo again" });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe("ALREADY_VOIDED");

      const reversals = await ConsumptionTransaction.find({
        consumerId: individualKhataId,
        businessDate: "2026-08-12",
        entryType: "REVERSAL",
      }).lean();
      expect(reversals).toHaveLength(1);
      // Signed: the log must stay additively consistent, so quantity AND money
      // are negated. Keeping quantity positive made any rebuild from the log
      // sum 3 + 3 while the money summed correctly.
      expect(reversals[0].quantity).toBe(-3);
      expect(reversals[0].totalPaisa).toBe(-18000);

      const cell = await DailyConsumption.findOne({
        consumerId: individualKhataId,
        businessDate: "2026-08-12",
        itemId,
      }).lean();
      expect(cell!.quantity).toBe(0);
    });

    it("refuses to void an order inside a finalized bill period", async () => {
      const khata = await agent.post("/api/khatas").send({
        type: "INDIVIDUAL",
        displayName: "Finalized Period Khata",
        startDate: "2026-01-01",
        billingStartDay: 1,
      });
      const sealedKhataId = khata.body.data.khata._id;

      const order = await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: sealedKhataId,
        itemId,
        quantity: 1,
        businessDate: "2026-09-10",
      });
      const txId = order.body.data.transaction._id;

      const billRes = await agent.post("/api/bills/generate").send({
        khataId: sealedKhataId,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });
      expect(billRes.status).toBe(201);

      // The bill froze the line items, so the correction has to happen through
      // the bill (void it, then correct) or the invoice no longer matches the
      // events it was built from.
      const res = await agent
        .patch(`/api/consumption/${txId}/void`)
        .send({ reason: "too late" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BILL_FINALIZED");

      // Still exactly one active order and no reversal.
      expect(
        await ConsumptionTransaction.countDocuments({
          consumerId: sealedKhataId,
          entryType: "REVERSAL",
        }),
      ).toBe(0);
    });
  });

  describe("customer search", () => {
    it("matches bosses case-insensitively", async () => {
      const res = await agent.get("/api/customers/search?q=ramesh");
      expect(res.status).toBe(200);
      const names = res.body.data.customers.map((c: { name: string }) =>
        c.name.toLowerCase(),
      );
      // Boss has no searchName field, so the aggregate matched `name` with a
      // plain case-sensitive $regex and "ramesh" never matched
      // "Rameshwar Prasad".
      expect(names.some((n: string) => n.includes("ramesh"))).toBe(true);
    });

    it("excludes offline consumers by default and includes them on request", async () => {
      await agent
        .patch(`/api/khatas/${officeKhataId}/status`)
        .send({ status: "OFFLINE" });

      const hidden = await agent.get("/api/customers/search?q=ramesh");
      expect(hidden.body.data.customers).toHaveLength(0);

      const shown = await agent.get(
        "/api/customers/search?q=ramesh&includeOffline=true",
      );
      // includeOffline was compared against the string 'true' AFTER the
      // validator had already coerced it to a boolean, so it was permanently
      // false and offline consumers were unreachable.
      expect(shown.body.data.customers.length).toBeGreaterThan(0);

      await agent
        .patch(`/api/khatas/${officeKhataId}/status`)
        .send({ status: "ACTIVE" });

      // Taking an office offline cascades its bosses and staff to INACTIVE,
      // and reactivating the khata deliberately does NOT undo that — staff
      // must be re-enabled individually so nobody silently rejoins a billing
      // group. So the boss stays INACTIVE; it only becomes searchable again
      // via includeOffline.
      expect((await Boss.findById(bossId).lean())!.status).toBe("INACTIVE");
      expect((await Khata.findById(officeKhataId).lean())!.status).toBe(
        "ACTIVE",
      );

      const defaultSearch = await agent.get("/api/customers/search?q=ramesh");
      expect(defaultSearch.body.data.customers).toHaveLength(0);

      await agent.patch(`/api/bosses/${bossId}`).send({ status: "ACTIVE" });
      const afterReenable = await agent.get("/api/customers/search?q=ramesh");
      expect(afterReenable.body.data.customers.length).toBeGreaterThan(0);
    });
  });

  describe("expense categories", () => {
    it("is reachable at its own path and paginates under data.rows", async () => {
      const cat = await agent
        .post("/api/expense-categories")
        .send({ name: "Regression Supplies" });
      expect(cat.status).toBe(201);

      const created = await agent.post("/api/expenses").send({
        categoryId: cat.body.data.category._id,
        itemName: "Apron",
        quantity: 2,
        unit: "piece",
        amountPaisa: 900,
        supplier: "Test Supplier",
        businessDate: "2026-01-05",
        paymentMethod: "CASH",
      });
      expect(created.status).toBe(201);

      // `POST /expenses/categories` used to be swallowed by the `/:id` route,
      // and the list sent a bare array where every other paginated endpoint
      // sends data.rows.
      const list = await agent.get("/api/expenses");
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.data.rows)).toBe(true);
      expect(list.body.data.rows.length).toBeGreaterThan(0);
      expect(list.body.meta).toBeDefined();
    });

    it("treats a regex metacharacter in a category name as a literal", async () => {
      const res = await agent
        .post("/api/expense-categories")
        .send({ name: "Tea.Salt" });
      expect(res.status).toBe(201);
      const list = await agent.get(
        "/api/expense-categories?includeInactive=true",
      );
      const names = list.body.data.categories.map(
        (c: { name: string }) => c.name,
      );
      expect(names).toContain("Tea.Salt");
    });
  });

  describe("settings", () => {
    it("updates one profile field without discarding the others", async () => {
      const before = await agent.get("/api/settings/profile");
      const originalName = before.body.data.profile.name;

      await agent
        .patch("/api/settings/profile")
        .send({ billingNote: "Pay before the 5th." });
      const after = await agent
        .patch("/api/settings/profile")
        .send({ address: "New address" });

      expect(after.status).toBe(200);
      // The upsert set BOTH $set and $setOnInsert over the same fields, so
      // every update pushed the full defaults over the existing profile.
      expect(after.body.data.profile.billingNote).toBe("Pay before the 5th.");
      expect(after.body.data.profile.address).toBe("New address");
      expect(after.body.data.profile.name).toBe(originalName);
    });
  });

  describe("dates and money", () => {
    it("rejects impossible calendar dates", async () => {
      for (const bad of ["2026-13-45", "2026-02-30", "2026-1-5"]) {
        const res = await agent.post("/api/consumption").send({
          consumerType: "INDIVIDUAL",
          consumerId: individualKhataId,
          itemId,
          quantity: 1,
          businessDate: bad,
        });
        // Without the customParseFormat plugin dayjs ignores the format and
        // strictness arguments and silently accepts these.
        expect(res.status).toBe(422);
      }
    });

    it("rejects a negative payment amount", async () => {
      const res = await agent.post("/api/payments").send({
        khataId: individualKhataId,
        amountPaisa: -500,
        method: "CASH",
        paymentDate: "2026-01-01",
      });
      expect(res.status).toBe(422);
    });
  });

  describe("boss name search index", () => {
    it("stores a lowercased searchName on every boss", async () => {
      const bosses = await Boss.find({}).lean();
      expect(bosses.length).toBeGreaterThan(0);
      for (const boss of bosses) {
        expect(boss.searchName).toBe(boss.name.toLowerCase().trim());
      }
    });

    it("keeps the office itself searchable as an OFFICE consumer (no default boss)", async () => {
      const office = await Khata.findById(officeKhataId).lean();
      expect(office!.billingMode).toBe("MIXED");
      const defaultBoss = await Boss.findOne({
        khataId: office!._id,
        isDefault: true,
      }).lean();
      expect(defaultBoss).toBeNull();

      const search = await agent.get("/api/customers/search?q=regression office");
      expect(search.status).toBe(200);
      expect(search.body.data.customers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            consumerType: "OFFICE",
            name: "Regression Office",
            khataId: officeKhataId,
          }),
        ]),
      );
    });
  });

  describe("bill void releases", () => {
    it("returns credit to a payment whose allocation pointed at the voided bill", async () => {
      // A dedicated khata so `due` is this bill's own total, not a total that
      // also absorbs dues carried forward from earlier periods.
      const khata = await agent.post("/api/khatas").send({
        type: "INDIVIDUAL",
        displayName: "Bill Void Khata",
        startDate: "2026-01-01",
        billingStartDay: 1,
      });
      const voidKhataId = khata.body.data.khata._id;

      await agent.post("/api/consumption").send({
        consumerType: "INDIVIDUAL",
        consumerId: voidKhataId,
        itemId,
        quantity: 1,
        businessDate: "2026-10-10",
      });
      const billRes = await agent.post("/api/bills/generate").send({
        khataId: voidKhataId,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      });
      const billId = billRes.body.data.bill._id;
      const due = billRes.body.data.bill.duePaisa;

      const paymentRes = await agent.post("/api/payments").send({
        khataId: voidKhataId,
        amountPaisa: due,
        method: "CASH",
        paymentDate: "2026-10-15",
        reference: "to-be-released",
      });
      const paymentId = paymentRes.body.data.payment._id;
      expect((await Payment.findById(paymentId).lean())!.unallocatedPaisa).toBe(
        0,
      );

      const voidRes = await agent
        .post(`/api/bills/${billId}/void`)
        .send({ reason: "reissue" });
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data.releasedCreditPaisa).toBe(due);

      const payment = await Payment.findById(paymentId).lean();
      expect(payment!.unallocatedPaisa).toBe(due);
      expect(payment!.allocations).toHaveLength(0);

      const bill = await Bill.findById(billId).lean();
      expect(bill!.isVoided).toBe(true);
    });
  });
});
