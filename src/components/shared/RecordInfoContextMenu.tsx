import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRecordInfo } from '@/hooks/useRecordInfo';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  tableName: string;
  recordId: string | null | undefined;
  mode?: 'created' | 'last_changed';
  /** Use asChild=false when wrapping a React component (not a DOM element) — avoids the
   *  ContextMenuTrigger asChild limitation where props aren't forwarded through components. */
  asChild?: boolean;
  children: React.ReactNode;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RecordInfoDialog({
  recordId,
  mode,
  open,
  onOpenChange,
}: {
  recordId: string;
  mode: 'created' | 'last_changed';
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useRecordInfo(open ? recordId : null, mode);

  const label = mode === 'last_changed' ? 'Відмітку змінено' : 'Дата створення';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Інформація про запис
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-36 shrink-0">{label}:</span>
              <span className="font-medium">{formatDate(data.created_at)}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-36 shrink-0">Автор:</span>
              <span className="font-medium">
                {data.user_profiles?.full_name ?? 'Невідомо'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Інформація недоступна — запис зроблено до впровадження обліку.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RecordInfoContextMenu({ tableName: _tableName, recordId, mode = 'created', asChild: useAsChild = true, children }: Props) {
  const { role } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Non-privileged users: pass children through directly.
  if (role !== 'owner' && role !== 'admin') {
    return <>{children}</>;
  }

  // For owner/admin: always render the ContextMenu wrapper regardless of recordId.
  // This keeps children structurally stable so they don't remount when a record is
  // created or deleted (e.g., switching between status "П" and a numeric value).
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild={useAsChild}>{children}</ContextMenuTrigger>
        {recordId && (
          <ContextMenuContent>
            <ContextMenuItem
              className="flex items-center gap-2"
              onSelect={() => setDialogOpen(true)}
            >
              <Info className="h-4 w-4" />
              Інфо
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
      {dialogOpen && recordId && (
        <RecordInfoDialog
          recordId={recordId}
          mode={mode}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </>
  );
}
