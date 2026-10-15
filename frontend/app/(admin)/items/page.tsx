'use client';

import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { useToast } from '../../../providers/ToastProvider';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { itemService, type CreateItemInput } from '../../../lib/services/operationService';
import { ApiError } from '../../../lib/apiClient';
import type { Item } from '../../../types/api';
import { formatNPR, paisaToRupees, rupeesToPaisa } from '../../../utils/money';

export default function ItemsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [category, setCategory] = useState('');
  const [activeOnly, setActiveOnly] = useState('true');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const result = useAsync(
    (signal) =>
      itemService.list(
        {
          q: debouncedQ.trim() || undefined,
          category: category.trim() || undefined,
          isActive: activeOnly === '' ? undefined : activeOnly === 'true',
          page,
        },
        signal
      ),
    [debouncedQ, category, activeOnly, page]
  );

  async function deactivate(item: Item) {
    try {
      await itemService.deactivate(item._id);
      toast.success(`${item.name} deactivated.`);
      result.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not deactivate.');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Items"
        description="The canteen menu. Prices are stored in paisa."
        actions={<Button onClick={() => setCreating(true)}>New item</Button>}
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Input label="Search" placeholder="Item name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Input label="Category" placeholder="e.g. Snacks" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} />
          <Select label="Show" value={activeOnly} onChange={(e) => { setActiveOnly(e.target.value); setPage(1); }}>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
            <option value="">All</option>
          </Select>
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load items" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No items found" description="Add menu items so they can be billed." action={<Button onClick={() => setCreating(true)}>New item</Button>} />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th align="right">Selling</Th>
                  <Th align="right">Cost</Th>
                  <Th>Unit</Th>
                  <Th>Status</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((item) => (
                  <Tr key={item._id}>
                    <Td className="font-medium text-gray-900">{item.name}</Td>
                    <Td>{item.category || '—'}</Td>
                    <Td align="right">{formatNPR(item.sellingPricePaisa)}</Td>
                    <Td align="right">{item.costPricePaisa != null ? formatNPR(item.costPricePaisa) : '—'}</Td>
                    <Td>{item.unit || '—'}</Td>
                    <Td><Badge tone={item.isActive ? 'green' : 'red'}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>Edit</Button>
                        {item.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => void deactivate(item)}>Deactivate</Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
      </Card>

      <ItemModal
        key={editing?._id ?? (creating ? 'new' : 'closed')}
        open={creating || Boolean(editing)}
        item={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          result.reload();
        }}
      />
    </div>
  );
}

function ItemModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [selling, setSelling] = useState(item ? String(paisaToRupees(item.sellingPricePaisa)) : '');
  const [cost, setCost] = useState(item?.costPricePaisa != null ? String(paisaToRupees(item.costPricePaisa)) : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    const sellingPaisa = rupeesToPaisa(Number(selling));
    if (!Number.isFinite(sellingPaisa) || sellingPaisa < 0) {
      setError('Enter a valid selling price.');
      return;
    }
    setSaving(true);
    setError('');
    const payload: CreateItemInput = {
      name: name.trim(),
      category: category.trim(),
      sellingPricePaisa: sellingPaisa,
      costPricePaisa: cost.trim() === '' ? null : rupeesToPaisa(Number(cost)),
      unit: unit.trim() || undefined,
      description: description.trim() || undefined,
    };
    try {
      if (item) {
        await itemService.update(item._id, payload);
        toast.success('Item updated.');
      } else {
        await itemService.create(payload);
        toast.success('Item created.');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={item ? 'Edit item' : 'New item'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input label="Unit" placeholder="plate, cup, pc" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <Input label="Selling price (NPR)" type="number" step="0.01" required value={selling} onChange={(e) => setSelling(e.target.value)} />
        <Input label="Cost price (NPR)" type="number" step="0.01" hint="Optional — used for profit estimates." value={cost} onChange={(e) => setCost(e.target.value)} />
        <div className="sm:col-span-2">
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
