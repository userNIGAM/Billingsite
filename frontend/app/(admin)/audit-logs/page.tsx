'use client';

import { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingState } from '../../../components/ui/Spinner';
import { Pagination } from '../../../components/ui/Pagination';
import { Modal } from '../../../components/ui/Modal';
import { useAsync } from '../../../hooks/useAsync';
import { useDebounced } from '../../../hooks/useDebounce';
import { auditService, type AuditLog } from '../../../lib/services/insightService';
import { formatDateTime } from '../../../utils/date';

const ENTITIES = [
  'Khata', 'Boss', 'Staff', 'Item', 'Consumption', 'Bill', 'Payment',
  'Expense', 'ExpenseCategory', 'Settings', 'Admin',
];

export default function AuditLogsPage() {
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const debouncedEntityId = useDebounced(entityId, 400);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const result = useAsync(
    (signal) =>
      auditService.list(
        {
          entity: entity || undefined,
          entityId: debouncedEntityId.trim() || undefined,
          page,
          limit: 30,
        },
        signal
      ),
    [entity, debouncedEntityId, page]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit logs"
        description="Every write the API accepts, newest first."
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Select label="Entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">All entities</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
          <Input
            label="Entity ID"
            placeholder="Mongo ObjectId…"
            value={entityId}
            onChange={(e) => { setEntityId(e.target.value); setPage(1); }}
          />
        </div>

        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <EmptyState title="Could not load audit logs" description={result.error} action={<Button onClick={result.reload}>Retry</Button>} />
        ) : !result.data || result.data.rows.length === 0 ? (
          <EmptyState title="No audit entries found" />
        ) : (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>When</Th>
                  <Th>Admin</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th align="right"> </Th>
                </Tr>
              </THead>
              <TBody>
                {result.data.rows.map((log) => (
                  <Tr key={log._id}>
                    <Td className="text-xs">{formatDateTime(log.createdAt)}</Td>
                    <Td>{log.adminNameSnapshot || log.adminId}</Td>
                    <Td><Badge tone="blue">{log.action}</Badge></Td>
                    <Td className="text-xs">
                      {log.entity}
                      {log.entityId ? <span className="ml-1 font-mono text-gray-400">{log.entityId.slice(-6)}</span> : null}
                    </Td>
                    <Td align="right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(log)}>Details</Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={result.data.meta} onPageChange={setPage} disabled={result.loading} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.action} · ${selected.entity}` : 'Audit entry'}
        size="lg"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <p>Admin: <span className="text-gray-800">{selected.adminNameSnapshot || selected.adminId}</span></p>
              <p>When: <span className="text-gray-800">{formatDateTime(selected.createdAt)}</span></p>
              <p className="col-span-2">Entity ID: <span className="font-mono text-gray-800">{selected.entityId || '—'}</span></p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Before</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">
                {JSON.stringify(selected.before ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">After</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">
                {JSON.stringify(selected.after ?? null, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
