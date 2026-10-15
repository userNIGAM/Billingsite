'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge, statusTone } from '../../../components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { khataService } from '../../../lib/services/khataService';
import { formatNPR } from '../../../utils/money';

export default function OfficesPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [page, setPage] = useState(1);

  const result = useAsync(
    (signal) =>
      khataService.list(
        { type: 'OFFICE', q: debouncedQ.trim() || undefined, page, limit: 20 },
        signal
      ),
    [debouncedQ, page]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Offices"
        description="Office khatas, each grouping one or more bosses and their staff."
        actions={
          <Link href="/khatas/new">
            <Button>New office khata</Button>
          </Link>
        }
      />

      <Card>
        <div className="p-4">
          <Input
            label="Search offices"
            placeholder="Name, code, or phone…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load offices" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No office khatas yet" description="Create a khata of type OFFICE to get started." />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Office</Th>
                  <Th>Code</Th>
                  <Th>Status</Th>
                  <Th align="right">Bosses</Th>
                  <Th align="right">Staff</Th>
                  <Th align="right">Due</Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((k) => (
                  <Tr key={k._id}>
                    <Td>
                      <Link href={`/khatas/${k._id}`} className="font-medium text-brand-700 hover:underline">
                        {k.displayName}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{k.khataCode}</Td>
                    <Td><Badge tone={statusTone(k.status)}>{k.status}</Badge></Td>
                    <Td align="right">{k.bossCount ?? '—'}</Td>
                    <Td align="right">{k.staffCount ?? '—'}</Td>
                    <Td align="right" className="font-medium">{k.duePaisa != null ? formatNPR(k.duePaisa) : '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
      </Card>
    </div>
  );
}
