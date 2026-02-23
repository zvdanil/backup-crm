import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AccountOpeningBalance } from "@/hooks/useAccountOpeningBalances";
import { getMonthStartDate } from "@/lib/attendance";

const formSchema = z.object({
  account_id: z.string().min(1, "Оберіть рахунок"),
  amount: z.string().min(1, "Вкажіть суму"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AccountOpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
  accounts: { id: string; name: string }[];
  editingBalance: AccountOpeningBalance | null;
  onSubmit: (data: { account_id: string; amount: number; notes?: string | null }) => Promise<void>;
  isLoading?: boolean;
}

export function AccountOpeningBalanceDialog({
  open,
  onOpenChange,
  month,
  year,
  accounts,
  editingBalance,
  onSubmit,
  isLoading = false,
}: AccountOpeningBalanceDialogProps) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { account_id: "", amount: "", notes: "" },
  });

  const balanceDate = getMonthStartDate(year, month);

  useEffect(() => {
    if (open) {
      if (editingBalance) {
        reset({
          account_id: editingBalance.account_id,
          amount: String(editingBalance.amount),
          notes: editingBalance.notes ?? "",
        });
      } else {
        reset({ account_id: "", amount: "", notes: "" });
      }
    }
  }, [open, editingBalance, reset]);

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit({
      account_id: data.account_id,
      amount: parseFloat(data.amount),
      notes: data.notes?.trim() || null,
    });
    onOpenChange(false);
  };

  const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  const dateLabel = `${monthNames[month]} ${year}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingBalance ? "Редагувати залишок" : "Додати залишок"} на {dateLabel}
          </DialogTitle>
          <DialogDescription>
            {editingBalance ? "Змініть суму залишку на вибрану дату." : "Вкажіть рахунок та суму залишку на 1-ше число місяця."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Рахунок</Label>
            <Select
              value={watch("account_id")}
              onValueChange={(v) => setValue("account_id", v)}
              disabled={!!editingBalance}
            >
              <SelectTrigger>
                <SelectValue placeholder="Оберіть рахунок" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_id && (
              <p className="text-sm text-destructive">{errors.account_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Сума (₴) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount")}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Може бути відʼємною (борг)</p>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Коментар</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder="Примітка до залишку (опціонально)"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
