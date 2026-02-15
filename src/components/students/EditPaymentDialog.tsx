import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";

const editPaymentSchema = z.object({
  amount: z.string().min(1, "Вкажіть суму"),
  date: z.string().min(1, "Вкажіть дату"),
  account_id: z.string(),
  description: z.string().optional(),
});

type EditPaymentFormData = z.infer<typeof editPaymentSchema>;

export interface PaymentToEdit {
  id: string;
  amount: number;
  date: string;
  account_id: string | null;
  description: string | null;
}

interface EditPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentToEdit | null;
  onSubmit: (data: { amount: number; date: string; account_id: string | null; description: string | null }) => void;
  isLoading?: boolean;
}

export function EditPaymentDialog({
  open,
  onOpenChange,
  payment,
  onSubmit,
  isLoading = false,
}: EditPaymentDialogProps) {
  const { data: accounts = [] } = usePaymentAccounts();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<EditPaymentFormData>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      amount: "",
      date: "",
      account_id: "",
      description: "",
    },
  });

  useEffect(() => {
    if (open && payment) {
      reset({
        amount: String(payment.amount),
        date: payment.date,
        account_id: payment.account_id || "none",
        description: payment.description || "",
      });
    }
  }, [open, payment, reset]);

  const handleFormSubmit = (data: EditPaymentFormData) => {
    onSubmit({
      amount: parseFloat(data.amount),
      date: data.date,
      account_id: data.account_id && data.account_id !== "none" ? data.account_id : null,
      description: data.description || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редагувати платіж</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сума (₴) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...register("amount")}
                placeholder="1000"
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Дата *</Label>
              <Input
                id="date"
                type="date"
                {...register("date")}
              />
              {errors.date && (
                <p className="text-sm text-destructive">{errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Рахунок</Label>
            <Select
              value={watch("account_id") || "none"}
              onValueChange={(value) => setValue("account_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Оберіть рахунок" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не вказано</SelectItem>
                {accounts.filter((a) => a.is_active).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Опис платежу..."
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 pb-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
