'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge, statusTone } from '../../../components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { khataService } from '../../../lib/services/khataService';
import type { KhataStatus, KhataType } from '../../../types/api';
import { formatNPR } from '../../../utils/money';

export default function KhatasPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [type, setType] = useState<KhataType | ''>('');
  const [status, setStatus] = useState<KhataStatus | ''>('');
  const [page, setPage] = useState(1);

  const result = useAsync(
    (signal) =>
      khataService.list(
        {
          q: debouncedQ.trim() || undefined,
          type: type || undefined,
          status: status || undefined,
          page,
          limit: 20,
        },
        signal
      ),
    [debouncedQ, type, status, page]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Khatas"
        description="Individuals and offices that keep a running ledger."
        actions={
          <Link href="/khatas/new">
            <Button>New khata</Button>
          </Link>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Name, code, or phone…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as KhataType | '');
              setPage(1);
            }}
          >
            <option value="">All types</option>
            <option value="INDIVIDUAL">Individual</option>
            <option value="OFFICE">Office</option>
          </Select>
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as KhataStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="OFFLINE">Offline</option>
          </Select>
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState
            title="Could not load khatas"
            description={result.error}
            action={<Button onClick={result.reload}>Retry</Button>}
          />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No khatas found" description="Adjust the filters or create a new khata." />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th align="right">Due</Th>
                  <Th align="right"> </Th>
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
                    <Td>
                      <Badge tone={k.type === 'OFFICE' ? 'blue' : 'gray'}>{k.type}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={statusTone(k.status)}>{k.status}</Badge>
                    </Td>
                    <Td align="right" className="font-medium">
                      {k.duePaisa != null ? formatNPR(k.duePaisa) : '—'}
                    </Td>
                    <Td align="right">
                      <Link href={`/khatas/${k._id}`}>
                        <Button variant="secondary" size="sm">Open</Button>
                      </Link>
                    </Td>
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
