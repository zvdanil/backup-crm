import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PayrollPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event?: any) => void;
  register: any;
  errors: any;
  watch: any;
  setValue: any;
  accounts: Array<{ id: string; name: string }>;
  onCancel: () => void;
  isSaving: boolean;
  payoutsForSelectedDate: any[];
  salaryTxByPayoutId: Map<string, string>;
  commissionsMap: Map<string, { amount: number; id: string }>;
  formatCurrency: (amount: number) => string;
  onEditPayout: (payout: any, commissionAmount: number) => void;
  onDeletePayout: (payout: any) => void | Promise<void>;
  staffOptions: Array<{ id: string; name: string }>;
  staffFieldValue: string;
  onStaffFieldChange: (value: string) => void;
  staffFieldDisabled?: boolean;
  subcategoryOptions?: Array<{ id: string; name: string }>;
  subcategoryFieldValue?: string;
  onSubcategoryFieldChange?: (value: string) => void;
}

export function PayrollPayoutDialog({
  open,
  onOpenChange,
  onSubmit,
  register,
  errors,
  watch,
  setValue,
  accounts,
  onCancel,
  isSaving,
  payoutsForSelectedDate,
  salaryTxByPayoutId,
  commissionsMap,
  formatCurrency,
  onEditPayout,
  onDeletePayout,
  staffOptions,
  staffFieldValue,
  onStaffFieldChange,
  staffFieldDisabled = false,
  subcategoryOptions = [],
  subcategoryFieldValue = "none",
  onSubcategoryFieldChange,
}: PayrollPayoutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Реєстрація виплати</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="payout_staff">Співробітник</Label>
            <Select
              value={staffFieldValue}
              onValueChange={(value) => {
                onStaffFieldChange(value);
              }}
              disabled={staffFieldDisabled}
            >
              <SelectTrigger id="payout_staff">
                <SelectValue placeholder="Оберіть співробітника" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.staff_id && (
              <p className="text-sm text-red-500 mt-1">{errors.staff_id.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="payout_subcategory">Підкатегорія (необов'язково)</Label>
            <Select
              value={subcategoryFieldValue}
              onValueChange={(value) => onSubcategoryFieldChange?.(value)}
            >
              <SelectTrigger id="payout_subcategory">
                <SelectValue placeholder="Без підкатегорії" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без підкатегорії</SelectItem>
                {subcategoryOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="payout_amount">Сума (₴)</Label>
            <Input
              id="payout_amount"
              type="number"
              step="0.01"
              min="0.01"
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-sm text-red-500 mt-1">{errors.amount.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="payout_date">Дата виплати</Label>
            <Input id="payout_date" type="date" {...register("payout_date")} />
            {errors.payout_date && (
              <p className="text-sm text-red-500 mt-1">
                {errors.payout_date.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="payout_for_period">Виплата за період (необов'язково)</Label>
            <Input
              id="payout_for_period"
              type="month"
              {...register("payout_for_period")}
            />
            {errors.payout_for_period && (
              <p className="text-sm text-red-500 mt-1">
                {errors.payout_for_period.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="payout_commission">Комісія (₴)</Label>
            <Input
              id="payout_commission"
              type="number"
              step="0.01"
              min="0"
              {...register("commission", { valueAsNumber: true })}
              placeholder="Опціонально"
            />
          </div>

          <div>
            <Label htmlFor="payout_account">Рахунок списання</Label>
            <Select
              value={watch("account_id") || ""}
              onValueChange={(value) => {
                setValue("account_id", value);
              }}
            >
              <SelectTrigger id="payout_account">
                <SelectValue placeholder="Оберіть рахунок" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_id && (
              <p className="text-sm text-red-500 mt-1">{errors.account_id.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="payout_notes">Примітки (необов'язково)</Label>
            <Textarea id="payout_notes" {...register("notes")} rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Скасувати
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </form>

        {payoutsForSelectedDate.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium">Виплати за дату</div>
            <div className="space-y-2">
              {payoutsForSelectedDate.map((payout) => {
                const salTxId = salaryTxByPayoutId.get(payout.id);
                const comm = salTxId ? commissionsMap.get(salTxId) : undefined;
                return (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-destructive">
                        {formatCurrency(payout.amount)}
                        {comm && comm.amount > 0 && (
                          <span className="text-muted-foreground font-normal ml-1">
                            + {formatCurrency(comm.amount)} комісія
                          </span>
                        )}
                      </div>
                      {payout.notes && (
                        <div className="text-xs text-muted-foreground break-words">
                          {payout.notes}
                        </div>
                      )}
                      {payout.payout_for_period && (
                        <div className="text-xs text-muted-foreground break-words">
                          За період: {payout.payout_for_period}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onEditPayout(payout, comm?.amount ?? 0)}
                      >
                        Редагувати
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => onDeletePayout(payout)}
                      >
                        Видалити
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
