'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { LoadingState } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TBody, Td, Th, THead, Table, Tr } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { useAsync } from '../../../hooks/useAsync';
import { dashboardService } from '../../../lib/services/insightService';
import { formatNPR } from '../../../utils/money';
import { formatDate } from '../../../utils/date';

export default function DashboardPage() {
  const overview = useAsync((signal) => dashboardService.overview(signal), []);
  const outstanding = useAsync((signal) => dashboardService.outstanding(signal), []);

  if (overview.loading) return <LoadingState message="Loading dashboard…" />;

  if (overview.error || !overview.data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Card className="mt-4">
          <EmptyState
            title="Could not load the dashboard"
            description={overview.error ?? 'Please try again.'}
            action={<Button onClick={overview.reload}>Retry</Button>}
          />
        </Card>
      </div>
    );
  }

  const d = overview.data;
  const p = d.profitLoss;
  const hasRevenue = p.revenuePaisa > 0;
  const hasWeekActivity = d.salesExpenseSeries.some((point) => point.salesPaisa > 0 || point.expensePaisa > 0);
  const maxSeries = Math.max(...d.salesExpenseSeries.map((s) => Math.max(s.salesPaisa, s.expensePaisa)), 1);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description="A live snapshot of sales, collections, and what is still owed."
        actions={
          <>
            <Link href="/khatas/new">
              <Button variant="secondary"><Plus className="h-4 w-4" />New khata</Button>
            </Link>
            <Link href="/khaja">
              <Button><UtensilsCrossed className="h-4 w-4" />Record khaja</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={formatNPR(d.todaySalesPaisa)} tone="positive" />
        <StatCard label="This month's sales" value={formatNPR(d.monthSalesPaisa)} />
        <StatCard
          label="Collected today"
          value={formatNPR(d.collectionsToday.total)}
          hint={`Cash ${formatNPR(d.collectionsToday.cash)} · Digital ${formatNPR(d.collectionsToday.digital)}`}
          tone="positive"
        />
        <StatCard
          label="Outstanding dues"
          value={formatNPR(d.outstandingDuesPaisa)}
          hint={`${d.totalActiveKhatas} active khatas`}
          tone={d.outstandingDuesPaisa > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Profit &amp; Loss (this month)"
            subtitle={
              !hasRevenue
                ? 'No sales have been recorded this month.'
                : p.grossProfitEstimated
                ? `Estimated — only ${p.costCoveragePct}% of revenue has a known cost price`
                : 'All revenue has cost prices on record.'
            }
            action={
              !hasRevenue
                ? <Badge tone="gray">No data</Badge>
                : p.grossProfitEstimated
                  ? <Badge tone="amber">Estimated</Badge>
                  : <Badge tone="green">Complete</Badge>
            }
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500">Revenue (accrual)</dt>
              <dd className="text-right tabular-nums text-gray-900">{formatNPR(p.revenuePaisa)}</dd>
              <dt className="text-gray-500">COGS</dt>
              <dd className="text-right tabular-nums text-gray-900">{formatNPR(p.cogsPaisa)}</dd>
              <dt className="text-gray-500">Gross profit</dt>
              <dd className="text-right tabular-nums font-medium text-gray-900">{formatNPR(p.grossProfitPaisa)}</dd>
              <dt className="text-gray-500">Operating expenses</dt>
              <dd className="text-right tabular-nums text-gray-900">{formatNPR(p.operatingExpensePaisa)}</dd>
              <dt className="text-gray-500">Net profit</dt>
              <dd className="text-right tabular-nums font-semibold text-brand-700">{formatNPR(p.netProfitPaisa)}</dd>
              <dt className="text-gray-500">Cash surplus</dt>
              <dd className="text-right tabular-nums text-gray-900">{formatNPR(p.cashSurplusPaisa)}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sales &amp; Expenses" subtitle="Last 7 days" />
          <CardBody>
            {!hasWeekActivity ? (
              <EmptyState title="No activity in the last week" />
            ) : (
              <div className="flex h-44 items-end justify-between gap-2 pt-2">
                {d.salesExpenseSeries.map((point) => (
                  <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-36 w-full items-end justify-center gap-1 rounded-t-lg bg-gray-50/70 px-1">
                      <div
                        className="w-1/2 min-h-0.5 rounded-t-md bg-brand-500 transition-all"
                        style={{ height: `${Math.max(point.salesPaisa > 0 ? 3 : 0, (point.salesPaisa / maxSeries) * 100)}%` }}
                        title={`Sales ${formatNPR(point.salesPaisa)}`}
                      />
                      <div
                        className="w-1/2 min-h-0.5 rounded-t-md bg-orange-300 transition-all"
                        style={{ height: `${Math.max(point.expensePaisa > 0 ? 3 : 0, (point.expensePaisa / maxSeries) * 100)}%` }}
                        title={`Expenses ${formatNPR(point.expensePaisa)}`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">{point.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Sales</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-300" /> Expenses</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top items this month" />
          {d.topItems.length === 0 ? (
            <EmptyState title="No consumption recorded yet" />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Revenue</Th>
                </Tr>
              </THead>
              <TBody>
                {d.topItems.map((item) => (
                  <Tr key={item.itemId}>
                    <Td>{item.name}</Td>
                    <Td align="right">{item.quantity}</Td>
                    <Td align="right">{formatNPR(item.revenuePaisa)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Outstanding by khata"
            action={
              <Link href="/reports">
                <Button variant="secondary" size="sm">Reports</Button>
              </Link>
            }
          />
          {outstanding.loading ? (
            <LoadingState />
          ) : outstanding.error ? (
            <EmptyState
              title="Could not load outstanding balances"
              description={outstanding.error}
              action={<Button onClick={outstanding.reload}>Retry</Button>}
            />
          ) : !outstanding.data || outstanding.data.rows.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="Every khata is settled." />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Khata</Th>
                  <Th>Type</Th>
                  <Th align="right">Due</Th>
                  <Th>Last payment</Th>
                </Tr>
              </THead>
              <TBody>
                {outstanding.data.rows.slice(0, 8).map((row) => (
                  <Tr key={row.khataId}>
                    <Td>
                      <Link href={`/khatas/${row.khataId}`} className="font-medium text-brand-700 hover:underline">
                        {row.khataName}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={row.type === 'OFFICE' ? 'blue' : 'gray'}>{row.type}</Badge>
                    </Td>
                    <Td align="right" className="font-medium">{formatNPR(row.duePaisa)}</Td>
                    <Td>{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '—'}</Td>
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
