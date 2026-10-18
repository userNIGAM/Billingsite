'use client';

import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { useToast } from '../../../providers/ToastProvider';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { itemService, consumptionService } from '../../../lib/services/operationService';
import { customerService } from '../../../lib/services/insightService';
import { ApiError } from '../../../lib/apiClient';
import { servingSizeLabel, type CustomerSearchResult, type Item, type ServingSize } from '../../../types/api';
import { formatNPR } from '../../../utils/money';
import { formatDate, todayBusinessDate } from '../../../utils/date';

interface CartLine {
  key: string;
  item: Item;
  servingSize: ServingSize;
  quantity: number;
  consumer: CustomerSearchResult;
  businessDate: string;
}

interface SelectedItem {
  item: Item;
  servingSize: ServingSize;
  quantity: number;
}

function servingOptions(item: Item): ServingSize[] {
  return item.servingMode === 'HALF_AND_FULL' ? ['HALF', 'FULL'] : ['FULL'];
}

function servingPrice(item: Item, size: ServingSize): number {
  if (size === 'HALF') return item.halfPlatePricePaisa ?? item.sellingPricePaisa;
  return item.sellingPricePaisa;
}

function lineKey(itemId: string, size: ServingSize): string {
  return `${itemId}:${size}`;
}

/** Item picker cells — one button per available serving size. */
function ItemChoices({ item, onAdd }: { item: Item; onAdd: (item: Item, size: ServingSize) => void }) {
  const options = servingOptions(item);
  return (
    <>
      {options.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onAdd(item, size)}
          className="flex min-h-20 flex-col items-start justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition hover:border-brand-500 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <span className="font-medium text-gray-900">{item.name}</span>
          <span className="mt-1 text-xs text-gray-500">
            {options.length > 1 ? `${servingSizeLabel(size)} · ` : ''}
            {formatNPR(servingPrice(item, size))}
          </span>
        </button>
      ))}
    </>
  );
}

export default function KhajaRecordPage() {
  const toast = useToast();

  const [businessDate, setBusinessDate] = useState(todayBusinessDate());
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [saving, setSaving] = useState(false);

  const items = useAsync((signal) => itemService.listActive(signal), []);

  const search = useAsync(
    (signal) => customerService.search(debouncedQuery.trim(), false, signal),
    [debouncedQuery],
    { enabled: debouncedQuery.trim().length >= 2 }
  );

  const daily = useAsync(
    (signal) => consumptionService.daily({ date: businessDate }, signal),
    [businessDate]
  );
  const recentOrders = useAsync(
    (signal) => consumptionService.list({ consumerId: selected?.consumerId, page: 1, limit: 100 }, signal),
    [selected?.consumerId],
    { enabled: Boolean(selected) }
  );

  const availableItems = items.data ?? [];
  const recentItemIds = [...new Set(
    (recentOrders.data?.rows ?? [])
      .filter((transaction) => transaction.status === 'ACTIVE' && transaction.entryType === 'ORDER')
      .map((transaction) => transaction.itemId)
  )].slice(0, 10);
  const recentItems = recentItemIds
    .map((itemId) => availableItems.find((item) => item._id === itemId))
    .filter((item): item is Item => Boolean(item));
  const matchingItems = availableItems.filter((item) =>
    item.name.toLocaleLowerCase().includes(itemQuery.trim().toLocaleLowerCase())
  );
  const cartTotal = cart.reduce(
    (sum, line) => sum + servingPrice(line.item, line.servingSize) * line.quantity,
    0
  );
  const cartPeople = new Set(
    cart.map((line) => `${line.consumer.consumerType}-${line.consumer.consumerId}`)
  ).size;

  function resetPicker() {
    setSelected(null);
    setQuery('');
    setItemQuery('');
    setSelectedItems([]);
  }

  function addItem(item: Item, size: ServingSize) {
    const key = lineKey(item._id, size);
    setSelectedItems((previous) => {
      const existing = previous.find((row) => lineKey(row.item._id, row.servingSize) === key);
      return existing
        ? previous.map((row) =>
            lineKey(row.item._id, row.servingSize) === key ? { ...row, quantity: row.quantity + 1 } : row
          )
        : [...previous, { item, servingSize: size, quantity: 1 }];
    });
  }

  function reduceItem(key: string) {
    setSelectedItems((previous) =>
      previous.flatMap((row) => {
        if (lineKey(row.item._id, row.servingSize) !== key) return [row];
        return row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : [];
      })
    );
  }

  function addPersonToBatch() {
    if (!selected) return;
    if (selectedItems.length === 0) {
      toast.error('Choose at least one item for this person.');
      return;
    }

    const lines = selectedItems.map(({ item, servingSize, quantity }) => ({
      key: crypto.randomUUID(),
      item,
      servingSize,
      quantity,
      consumer: selected,
      businessDate,
    }));

    setCart((previous) => [...previous, ...lines]);
    resetPicker();
  }

  async function saveAll() {
    if (cart.length === 0) return;
    setSaving(true);
    const failed: CartLine[] = [];
    let ok = 0;
    let firstError = '';
    // The API records one item per request, so the cart is flushed line by
    // line. Lines that fail stay in the cart so nothing is silently dropped.
    for (const line of cart) {
      try {
        await consumptionService.record({
          consumerType: line.consumer.consumerType,
          consumerId: line.consumer.consumerId,
          itemId: line.item._id,
          servingSize: line.servingSize,
          quantity: line.quantity,
          businessDate: line.businessDate,
        });
        ok += 1;
      } catch (err) {
        failed.push(line);
        if (!firstError) {
          firstError = err instanceof ApiError ? err.message : 'Unknown error';
        }
      }
    }
    setSaving(false);
    if (failed.length === 0) {
      toast.success(`Recorded ${ok} ${ok === 1 ? 'entry' : 'entries'}.`);
      setCart([]);
    } else {
      setCart(failed);
      toast.error(`${failed.length} line(s) failed: ${firstError}`);
    }
    void daily.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            {!selected ? (
              <Input
                label="Find a person or office"
                placeholder="Search by name or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full sm:w-1/2 [&_input]:h-14 [&_input]:text-base"
                hint="Search for an individual, office, boss, or staff member."
              />
            ) : <div className="w-full sm:w-1/2" />}
            <Input
              className="sm:w-48"
              label="Business date"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          </div>

          {selected ? (
            <>
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium text-brand-900">{selected.name}</span>{' '}
                <span className="text-brand-700">
                  ({selected.isOfficeDirect ? 'OFFICE' : selected.consumerType} · {selected.context})
                </span>
              </span>
              <Button variant="secondary" size="sm" onClick={resetPicker}>
                Change
              </Button>
              </div>

              <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Recently ordered</h3>
                {recentOrders.loading && <span className="text-xs text-gray-500">Loading…</span>}
              </div>
              {recentOrders.error ? (
                <p className="text-sm text-red-600">Could not load recent items: {recentOrders.error}</p>
              ) : recentItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {recentItems.map((item) => (
                    <ItemChoices key={item._id} item={item} onAdd={addItem} />
                  ))}
                </div>
              ) : !recentOrders.loading ? (
                <p className="text-sm text-gray-500">No previous items for this customer. Search below to add an item.</p>
              ) : null}
              </div>

              <Input
              label="Find an item"
              placeholder="Search available items…"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              className="w-full sm:w-1/2"
              />

              {itemQuery.trim() && (
              matchingItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {matchingItems.map((item) => (
                    <ItemChoices key={item._id} item={item} onAdd={addItem} />
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No available items match that search.</p>
              )}

              {selectedItems.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3">
                <h3 className="text-sm font-semibold text-gray-900">Order items</h3>
                {selectedItems.map(({ item, servingSize, quantity }) => {
                  const key = lineKey(item._id, servingSize);
                  const label = item.servingMode === 'HALF_AND_FULL' ? servingSizeLabel(servingSize) : null;
                  return (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-gray-800">
                      {item.name}
                      {label ? <span className="ml-2 text-xs text-gray-500">{label}</span> : null}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Reduce ${item.name} quantity`}
                        onClick={() => reduceItem(key)}
                      >
                        −
                      </Button>
                      <span className="min-w-5 text-center font-medium">×{quantity}</span>
                      <span className="w-20 text-right text-gray-600">
                        {formatNPR(servingPrice(item, servingSize) * quantity)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Add ${item.name}`}
                        onClick={() => addItem(item, servingSize)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  );
                })}
                <div className="flex justify-end border-t border-gray-100 pt-2">
                  <Button onClick={addPersonToBatch}>
                    Add {selected.name} to batch
                  </Button>
                </div>
              </div>
              )}
            </>
          ) : null}

          {!selected && search.loading ? (
            <LoadingState message="Searching people…" />
          ) : !selected && search.data && search.data.length > 0 ? (
            <ul className="max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
              {search.data.map((customer) => (
                <li key={`${customer.consumerType}-${customer.consumerId}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(customer);
                      setSelectedItems([]);
                      setItemQuery('');
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                  >
                    <span>
                      <span className="font-medium text-gray-900">{customer.name}</span>
                      <span className="ml-2 text-xs text-gray-500">{customer.context}</span>
                    </span>
                    <Badge tone={customer.consumerType === 'INDIVIDUAL' ? 'gray' : 'blue'}>
                      {customer.isOfficeDirect ? 'OFFICE' : customer.consumerType}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : !selected && debouncedQuery.trim().length >= 2 && !search.loading ? (
            <p className="text-sm text-gray-500">No matching people found.</p>
          ) : null}

        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Batch queue"
          subtitle={`${cartPeople} ${cartPeople === 1 ? 'person' : 'people'} · ${cart.length} ${cart.length === 1 ? 'item' : 'items'} · ${formatNPR(cartTotal)}`}
          action={
            <Button onClick={saveAll} loading={saving} disabled={cart.length === 0}>
              Save batch
            </Button>
          }
        />
        {cart.length === 0 ? (
          <EmptyState title="No orders in this batch" description="Add a person's items above to start a batch." />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Customer</Th>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Amount</Th>
                <Th align="right"> </Th>
              </Tr>
            </THead>
            <TBody>
              {cart.map((line) => (
                <Tr key={line.key}>
                  <Td>{line.consumer.name}</Td>
                  <Td>
                    {line.item.name}
                    {line.item.servingMode === 'HALF_AND_FULL' ? (
                      <span className="ml-2 text-xs text-gray-500">{servingSizeLabel(line.servingSize)}</span>
                    ) : null}
                  </Td>
                  <Td align="right">{line.quantity}</Td>
                  <Td align="right">{formatNPR(servingPrice(line.item, line.servingSize) * line.quantity)}</Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCart((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      Remove
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recorded for this date"
          subtitle={formatDate(businessDate)}
          action={
            <Button variant="secondary" size="sm" onClick={daily.reload}>
              Refresh
            </Button>
          }
        />
        {daily.loading ? (
          <LoadingState />
        ) : !daily.data || daily.data.length === 0 ? (
          <EmptyState title="Nothing recorded for this date" />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Customer</Th>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {daily.data.map((row) => (
                <Tr
                  key={
                    row._id ??
                    `${row.consumerType}:${row.consumerId}:${row.bossId ?? 'direct'}:${row.businessDate}:${row.itemId}:${row.servingSize}:${row.unitPricePaisa}`
                  }
                >
                  <Td>
                    <span className="font-medium text-gray-900">{row.consumerName}</span>
                    <span className="ml-2 text-xs text-gray-500">{row.consumerContext}</span>
                  </Td>
                  <Td>
                    {row.itemName}
                    {row.servingSize === 'HALF' ? (
                      <span className="ml-2 text-xs text-gray-500">{servingSizeLabel(row.servingSize)}</span>
                    ) : null}
                  </Td>
                  <Td align="right">{row.quantity}</Td>
                  <Td align="right">{formatNPR(row.totalPaisa)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <CardBody className="border-t border-gray-100 text-right text-sm">
          <span className="text-gray-500">Total: </span>
          <span className="font-semibold text-gray-900">
            {formatNPR((daily.data ?? []).reduce((sum, r) => sum + r.totalPaisa, 0))}
          </span>
        </CardBody>
      </Card>
    </div>
  );
}
