import { Link } from 'react-router-dom';
import { Landmark, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PaymentAccount } from '@/hooks/usePaymentAccounts';
import { useAccountBalance } from '@/hooks/useAccountBalances';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/attendance';

interface PaymentAccountCardProps {
  account: PaymentAccount;
  onEdit: (account: PaymentAccount) => void;
  onDelete: (id: string) => void;
}

export function PaymentAccountCard({
  account,
  onEdit,
  onDelete,
}: PaymentAccountCardProps) {
  const { data: balance, isLoading: balanceLoading } = useAccountBalance(account.id);

  return (
    <Link to={`/accounts/${account.id}`} className="block">
      <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg",
              account.is_active ? "bg-primary/10" : "bg-muted"
            )}>
              <Landmark className={cn("h-6 w-6", account.is_active ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground">{account.name}</h3>
                {!account.is_active && (
                  <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Неактивний
                  </span>
                )}
              </div>
              {account.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{account.description}</p>
              )}
              {balanceLoading ? (
                <div className="mt-2 h-4 w-20 bg-muted animate-pulse rounded" />
              ) : balance ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Залишок на рахунку</span>
                    <span className={cn(
                      "font-medium",
                      balance.free_funds >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {formatCurrency(balance.free_funds)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); onEdit(account); }}>
                <Pencil className="h-4 w-4 mr-2" />
                Редагувати
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.preventDefault(); onDelete(account.id); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Видалити
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Link>
  );
}
