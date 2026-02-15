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
import type { AccountOpeningBalance } from "@/hooks/useAccountOpeningBalances";

const formSchema = z.object({
  account_id: z.string().min(1, "Оберіть рахунок"),
  amount: z.string().min(1, "Вкажіть суму"),
});

type FormData = z.infer<typeof formSchema>;

interface AccountOpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
  accounts: { id: string; name: string }[];
  editingBalance: AccountOpeningBalance | null;
  onSubmit: (data: { account_id: string; amount: number }) => Promise<void>;
  isLoading?: boolean;
}

function getMonthStartDate(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().split("T")[0];
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
    defaultValues: { account_id: "", amount: "" },
  });

  const balanceDate = getMonthStartDate(year, month);

  useEffect(() => {
    if (open) {
      if (editingBalance) {
        reset({
          account_id: editingBalance.account_id,
          amount: String(editingBalance.amount),
        });
      } else {
        reset({ account_id: "", amount: "" });
      }
    }
  }, [open, editingBalance, reset]);

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit({
      account_id: data.account_id,
      amount: parseFloat(data.amount),
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
