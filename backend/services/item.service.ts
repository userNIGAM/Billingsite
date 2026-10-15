import { Item } from '../models/item.model';
import { ApiError } from '../utils/ApiError';
import { normalizeSearch, escapeRegex, buildPageMeta } from '../utils/pagination';
import { writeAuditLog } from './audit.service';
import type { CurrentAdmin } from '../middleware/auth';

export interface CreateItemInput {
  name: string;
  category?: string;
  sellingPricePaisa: number;
  costPricePaisa?: number | null;
  unit?: string;
  isActive?: boolean;
  description?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: string;
  sellingPricePaisa?: number;
  costPricePaisa?: number | null;
  unit?: string;
  isActive?: boolean;
  description?: string;
}

export async function createItem(input: CreateItemInput, admin: CurrentAdmin) {
  const item = await Item.create({
    name: input.name.trim(),
    searchName: normalizeSearch(input.name),
    category: input.category ?? 'Food',
    sellingPricePaisa: input.sellingPricePaisa,
    costPricePaisa: input.costPricePaisa ?? null,
    unit: input.unit ?? 'plate',
    isActive: input.isActive ?? true,
    description: input.description ?? '',
    createdBy: admin.adminId ? admin.adminId : null,
  });

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'ITEM_CREATED',
    entity: 'Item',
    entityId: String(item._id),
    after: { name: item.name, sellingPricePaisa: item.sellingPricePaisa },
  });

  return item;
}

export async function listItems(params: { q?: string; category?: string; isActive?: boolean; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (params.category) filter.category = params.category;
  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (params.q && params.q.trim() !== '') {
    filter.searchName = { $regex: escapeRegex(normalizeSearch(params.q)) };
  }

  const [items, total] = await Promise.all([
    Item.find(filter)
      .sort({ name: 1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean(),
    Item.countDocuments(filter),
  ]);

  return { rows: items, meta: buildPageMeta(total, params.page, params.limit) };
}

export async function getItem(id: string) {
  const item = await Item.findById(id).lean();
  if (!item) throw ApiError.notFound('Item not found.', 'ITEM_NOT_FOUND');
  return item;
}

export async function updateItem(id: string, input: UpdateItemInput, admin: CurrentAdmin) {
  const item = await Item.findById(id);
  if (!item) throw ApiError.notFound('Item not found.', 'ITEM_NOT_FOUND');

  const before = {
    name: item.name,
    category: item.category,
    sellingPricePaisa: item.sellingPricePaisa,
    costPricePaisa: item.costPricePaisa,
    unit: item.unit,
    isActive: item.isActive,
    description: item.description,
  };

  if (input.name !== undefined) {
    item.name = input.name;
    item.searchName = normalizeSearch(input.name);
  }
  if (input.category !== undefined) item.category = input.category;
  if (input.sellingPricePaisa !== undefined) item.sellingPricePaisa = input.sellingPricePaisa;
  if (input.costPricePaisa !== undefined) item.costPricePaisa = input.costPricePaisa;
  if (input.unit !== undefined) item.unit = input.unit;
  if (input.isActive !== undefined) item.isActive = input.isActive;
  if (input.description !== undefined) item.description = input.description;

  await item.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'ITEM_UPDATED',
    entity: 'Item',
    entityId: String(item._id),
    before,
    after: {
      name: item.name,
      sellingPricePaisa: item.sellingPricePaisa,
      costPricePaisa: item.costPricePaisa,
    },
  });

  return item;
}

/**
 * Soft delete only (E-16) — an item with consumption history stays intact for
 * historical bills but disappears from the Khaja item picker.
 */
export async function softDeleteItem(id: string, admin: CurrentAdmin) {
  const item = await Item.findById(id);
  if (!item) throw ApiError.notFound('Item not found.', 'ITEM_NOT_FOUND');
  if (!item.isActive) throw ApiError.conflict('ITEM_ALREADY_INACTIVE', 'This item is already deactivated.');

  item.isActive = false;
  await item.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'ITEM_DEACTIVATED',
    entity: 'Item',
    entityId: String(item._id),
    before: { isActive: true },
    after: { isActive: false },
  });

  return item;
}