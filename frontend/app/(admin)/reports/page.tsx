'use client';

import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Input, Select } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { StatCard } from '../../../components/ui/StatCard';
import { cn } from '../../../utils/cn';
import { useAsync } from '../../../hooks/useAsync';
import { reportService, type ReportGroup } from '../../../lib/services/insightService';
import { formatNPR } from '../../../utils/money';
import { formatDate, startOfMonth, todayBusinessDate } from '../../../utils/date';

type Tab = 'sales' | 'items' | 'collections' | 'profit' | 'expenses' | 'customers' | 'offices' | 'outstanding';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'items', label: 'Items' },
  { id: 'collections', label: 'Collections' },
  { id: 'profit', label: 'Profit & Loss' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'customers', label: 'Customers' },
  { id: 'offices', label: 'Offices' },
  { id: 'outstanding', label: 'Outstanding' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayBusinessDate());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="Aggregate views of sales, collections, and dues." />

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === t.id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="text-xs text-gray-400">Ranges are inclusive business dates (Asia/Kathmandu).</div>
        </div>
      </Card>

      {tab === 'sales' ? <SalesReportView from={from} to={to} /> : null}
      {tab === 'items' ? <ItemsReportView from={from} to={to} /> : null}
      {tab === 'collections' ? <CollectionsReportView from={from} to={to} /> : null}
      {tab === 'profit' ? <ProfitReportView from={from} to={to} /> : null}
      {tab === 'expenses' ? <ExpensesReportView from={from} to={to} /> : null}
      {tab === 'customers' ? <CustomersReportView /> : null}
      {tab === 'offices' ? <OfficesReportView /> : null}
      {tab === 'outstanding' ? <OutstandingReportView /> : null}
    </div>
  );
}

function useReport<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  return useAsync(loader, deps);
}

function SalesReportView({ from, to }: { from: string; to: string }) {
  const [groupBy, setGroupBy] = useState<ReportGroup>('day');
  const report = useReport((signal) => reportService.sales({ from, to, groupBy }, signal), [from, to, groupBy]);

  return (
    <Card>
      <CardHeader
        title="Sales"
        action={
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as ReportGroup)}>
            <option value="day">By day</option>
            <option value="item">By item</option>
            <option value="office">By office</option>
          </Select>
        }
      />
      {report.loading ? (
        <LoadingState />
      ) : report.error || !report.data ? (
        <EmptyState title="Could not load the report" description={report.error ?? ''} />
      ) : (
        <>
          <CardBody>
            <p className="text-sm text-gray-500">Total sales</p>
            <p className="text-xl font-semibold text-gray-900">{formatNPR(report.data.totalSalesPaisa)}</p>
          </CardBody>
          <Table>
            <THead>
              <Tr>
                <Th>{groupBy === 'day' ? 'Date' : groupBy === 'item' ? 'Item' : 'Office'}</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Revenue</Th>
              </Tr>
            </THead>
            <TBody>
              {report.data.groups.map((g, idx) => (
                <Tr key={idx}>
                  <Td>{g.date ? formatDate(g.date) : g.itemName ?? String(g._id ?? '—')}</Td>
                  <Td align="right">{g.quantity ?? '—'}</Td>
                  <Td align="right">{formatNPR(g.revenuePaisa)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </Card>
  );
}

function ItemsReportView({ from, to }: { from: string; to: string }) {
  const report = useReport((signal) => reportService.items({ from, to }, signal), [from, to]);
  return (
    <Card>
      <CardHeader title="Items sold" />
      {report.loading ? (
        <LoadingState />
      ) : !report.data || report.data.length === 0 ? (
        <EmptyState title="No item sales in this range" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Item</Th>
              <Th align="right">Quantity</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Margin</Th>
            </Tr>
          </THead>
          <TBody>
            {report.data.map((r) => (
              <Tr key={r.itemName}>
                <Td className="font-medium text-gray-900">{r.itemName}</Td>
                <Td align="right">{r.quantity}</Td>
                <Td align="right">{formatNPR(r.revenuePaisa)}</Td>
                <Td align="right">{formatNPR(r.costPaisa)}</Td>
                <Td align="right">{formatNPR(r.revenuePaisa - r.costPaisa)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function CollectionsReportView({ from, to }: { from: string; to: string }) {
  const report = useReport((signal) => reportService.collections({ from, to }, signal), [from, to]);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load collections" description={report.error ?? ''} /></Card>;
  const d = report.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={formatNPR(d.totalPaisa)} tone="positive" />
        <StatCard label="Cash" value={formatNPR(d.cashPaisa)} hint={`${d.cashCount} payments`} />
        <StatCard label="Digital" value={formatNPR(d.digitalPaisa)} hint={`${d.digitalCount} payments`} />
        <StatCard label="Other" value={formatNPR(d.otherPaisa)} hint={`${d.otherCount} payments`} />
      </div>
      <Card>
        <CardHeader title="By channel" />
        {d.byChannel.length === 0 ? (
          <EmptyState title="No collections in this range" />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Channel</Th>
                <Th align="right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {d.byChannel.map((c) => (
                <Tr key={c.channel}>
                  <Td>{c.channel}</Td>
                  <Td align="right">{formatNPR(c.amountPaisa)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ProfitReportView({ from, to }: { from: string; to: string }) {
  const report = useReport((signal) => reportService.profitLoss({ from, to }, signal), [from, to]);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load the report" description={report.error ?? ''} /></Card>;
  const d = report.data;
  return (
    <Card>
      <CardHeader
        title="Profit & Loss"
        subtitle={`${formatDate(d.from)} – ${formatDate(d.to)}`}
        action={d.grossProfitEstimated ? <Badge tone="amber">Gross profit estimated</Badge> : <Badge tone="green">Complete</Badge>}
      />
      <CardBody>
        <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gray-500">Revenue (accrual)</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.revenue)}</dd>
          <dt className="text-gray-500">COGS ({d.costCoveragePct}% covered)</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.cogs)}</dd>
          <dt className="text-gray-500">Gross profit</dt>
          <dd className="text-right tabular-nums font-medium">{formatNPR(d.grossProfit)}</dd>
          <dt className="text-gray-500">Operating expenses</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.operatingExpense)}</dd>
          <dt className="text-gray-500">Net profit</dt>
          <dd className="text-right tabular-nums font-semibold text-brand-700">{formatNPR(d.netProfit)}</dd>
          <dt className="text-gray-500">Collected</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.collected)}</dd>
          <dt className="text-gray-500">Outstanding</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.outstanding)}</dd>
          <dt className="text-gray-500">Cash surplus</dt>
          <dd className="text-right tabular-nums">{formatNPR(d.cashSurplus)}</dd>
        </dl>
      </CardBody>
    </Card>
  );
}

function ExpensesReportView({ from, to }: { from: string; to: string }) {
  const report = useReport((signal) => reportService.expenses({ from, to }, signal), [from, to]);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load the report" description={report.error ?? ''} /></Card>;
  const d = report.data;
  return (
    <div className="flex flex-col gap-4">
      <StatCard label="Total expenses" value={formatNPR(d.totalExpensePaisa)} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By category" />
          {d.byCategory.length === 0 ? (
            <EmptyState title="No expenses" />
          ) : (
            <Table>
              <THead><Tr><Th>Category</Th><Th align="right">Amount</Th></Tr></THead>
              <TBody>
                {d.byCategory.map((c) => (
                  <Tr key={c.categoryName}>
                    <Td>{c.categoryName}</Td>
                    <Td align="right">{formatNPR(c.amountPaisa)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="By day" />
          {d.byDay.length === 0 ? (
            <EmptyState title="No expenses" />
          ) : (
            <Table>
              <THead><Tr><Th>Date</Th><Th align="right">Amount</Th></Tr></THead>
              <TBody>
                {d.byDay.map((r) => (
                  <Tr key={r.date}>
                    <Td>{formatDate(r.date)}</Td>
                    <Td align="right">{formatNPR(r.amountPaisa)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function CustomersReportView() {
  const report = useReport((signal) => reportService.customers(signal), []);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load customers" description={report.error ?? ''} /></Card>;
  if (report.data.length === 0) return <Card><EmptyState title="No customers yet" /></Card>;
  return (
    <Card>
      <CardHeader title="Customer balances" />
      <Table>
        <THead>
          <Tr>
            <Th>Khata</Th>
            <Th>Type</Th>
            <Th align="right">Consumption</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Paid</Th>
            <Th align="right">Outstanding</Th>
          </Tr>
        </THead>
        <TBody>
          {report.data.map((r) => (
            <Tr key={r.khataId}>
              <Td className="font-medium text-gray-900">{r.khataName}</Td>
              <Td><Badge tone={r.type === 'OFFICE' ? 'blue' : 'gray'}>{r.type}</Badge></Td>
              <Td align="right">{formatNPR(r.consumptionTotalPaisa)}</Td>
              <Td align="right">{formatNPR(r.billedPaisa)}</Td>
              <Td align="right">{formatNPR(r.paidPaisa)}</Td>
              <Td align="right" className="font-medium">{formatNPR(r.outstandingPaisa)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function OfficesReportView() {
  const report = useReport((signal) => reportService.offices(signal), []);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load offices" description={report.error ?? ''} /></Card>;
  if (report.data.length === 0) return <Card><EmptyState title="No office khatas yet" /></Card>;
  return (
    <Card>
      <CardHeader title="Office balances" />
      <Table>
        <THead>
          <Tr>
            <Th>Office</Th>
            <Th align="right">Bosses</Th>
            <Th align="right">Staff</Th>
            <Th align="right">Consumption</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Paid</Th>
            <Th align="right">Outstanding</Th>
          </Tr>
        </THead>
        <TBody>
          {report.data.map((r) => (
            <Tr key={r.khataId}>
              <Td className="font-medium text-gray-900">{r.officeName}</Td>
              <Td align="right">{r.bossCount}</Td>
              <Td align="right">{r.staffCount}</Td>
              <Td align="right">{formatNPR(r.consumptionTotalPaisa)}</Td>
              <Td align="right">{formatNPR(r.billedPaisa)}</Td>
              <Td align="right">{formatNPR(r.paidPaisa)}</Td>
              <Td align="right" className="font-medium">{formatNPR(r.outstandingPaisa)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function OutstandingReportView() {
  const report = useReport((signal) => reportService.outstanding(signal), []);
  if (report.loading) return <LoadingState />;
  if (report.error || !report.data) return <Card><EmptyState title="Could not load outstanding" description={report.error ?? ''} /></Card>;
  if (report.data.rows.length === 0) return <Card><EmptyState title="Nothing outstanding" description="Every khata is settled." /></Card>;
  const total = report.data.rows.reduce((sum, r) => sum + r.duePaisa, 0);
  return (
    <Card>
      <CardHeader title="Outstanding dues" subtitle={`Total ${formatNPR(total)}`} />
      <Table>
        <THead>
          <Tr>
            <Th>Khata</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Last payment</Th>
            <Th align="right">Due</Th>
          </Tr>
        </THead>
        <TBody>
          {report.data.rows.map((r) => (
            <Tr key={r.khataId}>
              <Td className="font-medium text-gray-900">{r.khataName}</Td>
              <Td><Badge tone={r.type === 'OFFICE' ? 'blue' : 'gray'}>{r.type}</Badge></Td>
              <Td><Badge tone={r.status === 'ACTIVE' ? 'green' : 'red'}>{r.status}</Badge></Td>
              <Td>{r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—'}</Td>
              <Td align="right" className="font-medium">{formatNPR(r.duePaisa)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
