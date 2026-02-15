import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEnrollmentPriceHistory } from '@/hooks/useEnrollments';
import { formatDate, formatCurrency } from '@/lib/attendance';

interface EnrollmentPriceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  activityName: string;
}

export function EnrollmentPriceHistoryDialog({
  open,
  onOpenChange,
  enrollmentId,
  activityName,
}: EnrollmentPriceHistoryDialogProps) {
  const { data: history = [], isLoading } = useEnrollmentPriceHistory(enrollmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Історія зміни ціни</DialogTitle>
          <p className="text-sm text-muted-foreground">{activityName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Завантаження...
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Історія змін ціни відсутня
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата початку</TableHead>
                  <TableHead>Дата закінчення</TableHead>
                  <TableHead>Ціна</TableHead>
                  <TableHead>Знижка</TableHead>
                  <TableHead>Ціна зі знижкою</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => {
                  const discountMultiplier = 1 - (item.discount_percent || 0) / 100;
                  const finalPrice = item.custom_price
                    ? Math.round(item.custom_price * discountMultiplier * 100) / 100
                    : null;
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.effective_from)}</TableCell>
                      <TableCell>
                        {item.effective_to ? formatDate(item.effective_to) : 'До тепер'}
                      </TableCell>
                      <TableCell>
                        {item.custom_price !== null
                          ? formatCurrency(item.custom_price)
                          : 'Стандартна'}
                      </TableCell>
                      <TableCell>
                        {(item.discount_percent || 0) > 0
                          ? `${item.discount_percent}%`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {finalPrice !== null ? formatCurrency(finalPrice) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
