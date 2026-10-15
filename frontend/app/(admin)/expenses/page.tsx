'use client';

import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
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
import { expenseService } from '../../../lib/services/expenseService';
import { ApiError } from '../../../lib/apiClient';
import type { Expense, PaymentMethod } from '../../../types/api';
import { formatNPR, rupeesToPaisa } from '../../../utils/money';
import { formatDate, startOfMonth, todayBusinessDate } from '../../../utils/date';

export default function ExpensesPage() {
  const toast = useToast();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayBusinessDate());
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categories = useAsync((signal) => expenseService.listCategories(signal), []);
  const result = useAsync(
    (signal) =>
      expenseService.list(
        { from, to, categoryId: categoryId || undefined, page, limit: 20 },
        signal
      ),
    [from, to, categoryId, page]
  );

  async function remove(expense: Expense) {
    try {
      await expenseService.remove(expense._id);
      toast.success('Expense removed.');
      result.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the expense.');
    }
  }

  const total = (result.data?.rows ?? []).reduce((sum, e) => sum + e.amountPaisa, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Expenses"
        description="What the canteen spends — separate from khaja bills."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategoryOpen(true)}>Add category</Button>
            <Button onClick={() => setAddOpen(true)}>Add expense</Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="Expense categories"
          subtitle="System categories cannot be removed."
        />
        <CardBody className="flex flex-wrap gap-2">
          {(categories.data ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No categories yet.</p>
          ) : (
            (categories.data ?? []).map((c) => (
              <Badge key={c._id} tone={c.isSystem ? 'blue' : 'gray'}>
                {c.name}{c.isSystem ? ' · system' : ''}
              </Badge>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          <Select label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load expenses" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No expenses in this range" description="Add an expense to get started." />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Item</Th>
                  <Th>Category</Th>
                  <Th>Supplier</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((e) => (
                  <Tr key={e._id}>
                    <Td>{formatDate(e.businessDate)}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{e.itemName}</span>
                      {e.quantity ? <span className="ml-1 text-xs text-gray-500">× {e.quantity}{e.unit ? ` ${e.unit}` : ''}</span> : null}
                    </Td>
                    <Td>{e.categoryName ?? '—'}</Td>
                    <Td>{e.supplier || '—'}</Td>
                    <Td><Badge tone="gray">{e.paymentMethod}</Badge></Td>
                    <Td align="right" className="font-medium">{formatNPR(e.amountPaisa)}</Td>
                    <Td align="right">
                      <Button variant="ghost" size="sm" onClick={() => void remove(e)}>Remove</Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
        {result.data && result.data.rows.length > 0 ? (
          <CardBody className="border-t border-gray-100 text-right text-sm">
            <span className="text-gray-500">Page total: </span>
            <span className="font-semibold text-gray-900">{formatNPR(total)}</span>
          </CardBody>
        ) : null}
      </Card>

      <AddExpenseModal
        open={addOpen}
        categories={(categories.data ?? []).map((c) => ({ _id: c._id, name: c.name }))}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          result.reload();
        }}
      />

      <AddCategoryModal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        onSaved={() => {
          setCategoryOpen(false);
          categories.reload();
        }}
      />
    </div>
  );
}

function AddExpenseModal({
  open,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  categories: Array<{ _id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [businessDate, setBusinessDate] = useState(todayBusinessDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!categoryId) { setError('Choose a category.'); return; }
    if (!itemName.trim()) { setError('An item name is required.'); return; }
    const amountPaisa = rupeesToPaisa(Number(amount));
    if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    setError('');
    try {
      await expenseService.create({
        categoryId,
        itemName: itemName.trim(),
        amountPaisa,
        quantity: quantity ? Number(quantity) : undefined,
        unit: unit.trim() || undefined,
        supplier: supplier.trim() || undefined,
        businessDate,
        paymentMethod,
        note: note.trim() || undefined,
      });
      toast.success('Expense added.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add expense"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Add</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="sm:col-span-2">
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
        <Input label="Item name" required value={itemName} onChange={(e) => setItemName(e.target.value)} className="sm:col-span-2" />
        <Input label="Amount (NPR)" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date" type="date" required value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
        <Input label="Quantity" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <Input label="Unit" placeholder="kg, litre, pc" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <Input label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="sm:col-span-2" />
        <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="sm:col-span-2">
          <option value="CASH">Cash</option>
          <option value="DIGITAL">Digital</option>
          <option value="OTHER">Other</option>
        </Select>
        <div className="sm:col-span-2">
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}

function AddCategoryModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) { setError('A name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await expenseService.createCategory(name.trim());
      toast.success('Category added.');
      setName('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add category"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Add</Button>
        </>
      }
    >
      <Input label="Category name" required value={name} onChange={(e) => setName(e.target.value)} />
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
