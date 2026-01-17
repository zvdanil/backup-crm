import { useFinanceTransactions } from '@/hooks/useFinanceTransactions';
import { formatCurrency, formatDate } from '@/lib/attendance';
import { useActivities } from '@/hooks/useActivities';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface StudentPaymentHistoryProps {
  studentId: string;
  month?: number;
  year?: number;
}

export function StudentPaymentHistory({ 
  studentId, 
  month, 
  year 
}: StudentPaymentHistoryProps) {
  const { data: payments = [], isLoading } = useFinanceTransactions({
    studentId,
    type: 'payment',
    month,
    year,
  });
  const { data: activities = [] } = useActivities();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Завантаження...
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="p-8 text-center">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="text-sm text-muted-foreground">Немає оплат</p>
      </div>
    );
  }

  // Calculate total
  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-4">
      {isMobile ? (
        <div className="space-y-3">
          {payments.map((payment) => {
            const activity = payment.activity_id
              ? activities.find(a => a.id === payment.activity_id)
              : null;

            return (
              <div key={payment.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{formatDate(payment.date)}</div>
                    <div className="mt-1 text-sm font-medium">
                      {activity ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: activity.color }}
                          />
                          <span className="break-words">{activity.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground break-words">
                      {payment.description || '—'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn("font-semibold", "text-success")}>
                      +{formatCurrency(payment.amount || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Активність</TableHead>
              <TableHead>Опис</TableHead>
              <TableHead className="text-right">Сума</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const activity = payment.activity_id 
                ? activities.find(a => a.id === payment.activity_id)
                : null;
              
              return (
                <TableRow key={payment.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(payment.date)}
                  </TableCell>
                  <TableCell>
                    {activity ? (
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: activity.color }}
                        />
                        <span className="text-sm">{activity.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.description || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-semibold",
                      "text-success"
                    )}>
                      +{formatCurrency(payment.amount || 0)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}
      
      {payments.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground mr-2">Всього:</span>
            <span className="font-semibold text-success">
              +{formatCurrency(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
