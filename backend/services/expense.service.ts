import { Expense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import { ApiError } from '../utils/ApiError';
import { validateDateStr } from '../utils/date';
import { buildPageMeta, escapeRegex } from '../utils/pagination';
import { writeAuditLog } from './audit.service';
import type { CurrentAdmin } from '../middleware/auth';

const SYSTEM_CATEGORIES = [
  'Raw Material',
  'Meat',
  'Vegetables',
  'Dairy',
  'Groceries',
  'Beverages',
  'Gas',
  'Electricity',
  'Water',
  'Packaging',
  'Cleaning',
  'Transport',
  'Maintenance',
  'Salary',
  'Rent',
  'Other',
];

export async function seedSystemCategories() {
  for (const name of SYSTEM_CATEGORIES) {
    const exists = await ExpenseCategory.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (!exists) {
      await ExpenseCategory.create({ name, isSystem: true, isActive: true });
    }
  }
}

export async function listCategories(includeInactive = false) {
  const filter: Record<string, unknown> = includeInactive ? {} : { isActive: true };
  return ExpenseCategory.find(filter).sort({ name: 1 }).lean().then((rows) =>
    rows.map((c) => ({ _id: String(c._id), name: c.name, isSystem: c.isSystem, isActive: c.isActive }))
  );
}

export async function createCategory(name: string, admin: CurrentAdmin) {
  // escapeRegex is required here: interpolating raw user input into a $regex let
  // a caller submit `.*` to match ANY existing category (bogus 409 blocking
  // legitimate creation) or a backtracking pattern for a server-side ReDoS.
  // Every other regex search in the codebase already escapes.
  const existing = await ExpenseCategory.findOne({
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
  });
  if (existing) throw ApiError.conflict('CATEGORY_EXISTS', 'This category already exists.');
  const category = await ExpenseCategory.create({ name: name.trim(), isSystem: false, isActive: true });
  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'EXPENSE_CATEGORY_CREATED',
    entity: 'ExpenseCategory',
    entityId: String(category._id),
    after: { name: category.name },
  });
  return category;
}

export async function createExpense(input: {
  categoryId: string;
  itemName: string;
  quantity?: number;
  unit?: string;
  amountPaisa: number;
  supplier?: string;
  businessDate: string;
  paymentMethod?: 'CASH' | 'DIGITAL' | 'OTHER';
  note?: string;
}, admin: CurrentAdmin) {
  if (!validateDateStr(input.businessDate)) {
    throw ApiError.validation('businessDate must be a valid YYYY-MM-DD date.');
  }
  const category = await ExpenseCategory.findById(input.categoryId);
  if (!category) throw ApiError.notFound('Expense category not found.', 'CATEGORY_NOT_FOUND');

  const expense = await Expense.create({
    categoryId: category._id,
    itemName: input.itemName.trim(),
    quantity: input.quantity ?? 1,
    unit: input.unit ?? '',
    amountPaisa: input.amountPaisa,
    supplier: input.supplier ?? '',
    businessDate: input.businessDate,
    receivedAt: new Date(),
    paymentMethod: input.paymentMethod ?? 'CASH',
    note: input.note ?? '',
    createdBy: admin.adminId ?? null,
  });

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'EXPENSE_CREATED',
    entity: 'Expense',
    entityId: String(expense._id),
    after: { itemName: expense.itemName, amountPaisa: expense.amountPaisa, businessDate: expense.businessDate, category: category.name },
  });

  return expense;
}

export async function listExpenses(params: { from?: string; to?: string; categoryId?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (params.categoryId) filter.categoryId = params.categoryId;
  if (params.from || params.to) {
    filter.businessDate = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lte: params.to } : {}),
    };
  }

  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort({ businessDate: -1, createdAt: -1 }).skip((params.page - 1) * params.limit).limit(params.limit).lean(),
    Expense.countDocuments(filter),
  ]);

  const categoryIds = [...new Set(expenses.map((e) => String(e.categoryId)))];
  const categories = await ExpenseCategory.find({ _id: { $in: categoryIds } }).lean();
  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));

  return {
    rows: expenses.map((e) => ({
      ...e,
      _id: String(e._id),
      categoryId: String(e.categoryId),
      categoryName: nameById.get(String(e.categoryId)) ?? '',
    })),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export async function updateExpense(id: string, input: Partial<{
  categoryId: string;
  itemName: string;
  quantity: number;
  unit: string;
  amountPaisa: number;
  supplier: string;
  businessDate: string;
  paymentMethod: 'CASH' | 'DIGITAL' | 'OTHER';
  note: string;
}>, admin: CurrentAdmin) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found.', 'EXPENSE_NOT_FOUND');

  const before = {
    itemName: expense.itemName,
    amountPaisa: expense.amountPaisa,
    businessDate: expense.businessDate,
    categoryId: String(expense.categoryId),
  };

  if (input.categoryId) {
    // Verify the category like createExpense does, and store a real ObjectId
    // rather than assigning the raw request string to an ObjectId path.
    const category = await ExpenseCategory.findById(input.categoryId);
    if (!category) throw ApiError.notFound('Expense category not found.', 'CATEGORY_NOT_FOUND');
    expense.categoryId = category._id;
  }
  if (input.itemName !== undefined) expense.itemName = input.itemName;
  if (input.quantity !== undefined) expense.quantity = input.quantity;
  if (input.unit !== undefined) expense.unit = input.unit;
  if (input.amountPaisa !== undefined) expense.amountPaisa = input.amountPaisa;
  if (input.supplier !== undefined) expense.supplier = input.supplier;
  if (input.businessDate !== undefined) {
    if (!validateDateStr(input.businessDate)) throw ApiError.validation('businessDate must be valid.');
    expense.businessDate = input.businessDate;
  }
  if (input.paymentMethod !== undefined) expense.paymentMethod = input.paymentMethod;
  if (input.note !== undefined) expense.note = input.note;

  await expense.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'EXPENSE_UPDATED',
    entity: 'Expense',
    entityId: String(expense._id),
    before,
    after: { itemName: expense.itemName, amountPaisa: expense.amountPaisa, businessDate: expense.businessDate },
  });

  return expense;
}

export async function deleteExpense(id: string, admin: CurrentAdmin) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found.', 'EXPENSE_NOT_FOUND');
  await expense.deleteOne();
  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'EXPENSE_DELETED',
    entity: 'Expense',
    entityId: id,
    before: { itemName: expense.itemName, amountPaisa: expense.amountPaisa },
  });
  return { deleted: true };
}