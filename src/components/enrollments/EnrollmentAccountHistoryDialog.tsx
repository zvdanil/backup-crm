import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEnrollmentAccountHistory } from '@/hooks/useEnrollments';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { formatDate } from '@/lib/attendance';

interface EnrollmentAccountHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  activityName: string;
}

export function EnrollmentAccountHistoryDialog({
  open,
  onOpenChange,
  enrollmentId,
  activityName,
}: EnrollmentAccountHistoryDialogProps) {
  const { data: history = [], isLoading } = useEnrollmentAccountHistory(enrollmentId);
  const { data: accounts = [] } = usePaymentAccounts();

  const accountName = (accountId: string | null): string => {
    if (!accountId) return 'Не вказано (з налаштувань активності)';
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return accountId;
    return account.is_active ? account.name : `${account.name} (неактивний)`;
  };

  const formatInclusiveEndDate = (exclusiveEndDate: string): string => {
    const [y, m, d] = exclusiveEndDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    return formatDate(date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Історія прив'язки до рахунку</DialogTitle>
          <p className="text-sm text-muted-foreground">{activityName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Завантаження...
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Історія прив'язок відсутня
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата початку</TableHead>
                  <TableHead>Дата закінчення</TableHead>
                  <TableHead>Рахунок</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.effective_from)}</TableCell>
                    <TableCell>
                      {item.effective_to
                        ? formatInclusiveEndDate(item.effective_to)
                        : 'До тепер'}
                    </TableCell>
                    <TableCell>{accountName(item.account_id)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
