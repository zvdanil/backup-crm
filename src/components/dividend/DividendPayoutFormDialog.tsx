import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/attendance";
import type {
  DividendParticipant,
  DividendPayout,
} from "@/hooks/useDividendJournal";

export const PAYOUT_TYPES = [
  { value: "cash", label: "Нал" },
  { value: "non_cash", label: "Безнал" },
] as const;

type PayoutFormState = {
  participant_id: string;
  payout_date: string;
  type: "cash" | "non_cash";
  total_amount: number;
  cleaning_percent: number;
  notes: string;
  legs: { account_id: string; amount: string }[];
};

/** Початкові значення для створення виплати з контексту (наприклад, з журналу витрат) */
export interface InitialValuesForCreate {
  payout_date: string;
  total_amount: number;
  account_id: string | null;
}

export interface DividendPayoutFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: DividendParticipant[];
  accounts: { id: string; name: string }[];
  defaultCleaning: number;
  /** Режим редагування — заповнює форму із існуючої виплати */
  editingPayout: DividendPayout | null;
  /** Початкові значення для режиму створення (наприклад, з рядка витрати) */
  initialValuesForCreate?: InitialValuesForCreate | null;
  /** Після успішного збереження: при створенні передається id нової виплати, при редагуванні — без аргументу */
  onSuccess: (createdPayoutId?: string) => void;
  createPayout: ReturnType<typeof import("@/hooks/useDividendJournal").useCreateDividendPayout>;
  updatePayout: ReturnType<typeof import("@/hooks/useDividendJournal").useUpdateDividendPayout>;
}

export function DividendPayoutFormDialog({
  open,
  onOpenChange,
  participants,
  accounts,
  defaultCleaning,
  editingPayout,
  initialValuesForCreate,
  onSuccess,
  createPayout,
  updatePayout,
}: DividendPayoutFormDialogProps) {
  const [form, setForm] = useState<PayoutFormState>({
    participant_id: "",
    payout_date: new Date().toISOString().split("T")[0],
    type: "cash",
    total_amount: 0,
    cleaning_percent: defaultCleaning,
    notes: "",
    legs: [{ account_id: "", amount: "" }],
  });

  useEffect(() => {
    if (open) {
      if (editingPayout) {
        setForm({
          participant_id: editingPayout.participant_id,
          payout_date: editingPayout.payout_date,
          type: editingPayout.type,
          total_amount: editingPayout.total_amount,
          cleaning_percent: editingPayout.cleaning_percent,
          notes: editingPayout.notes ?? "",
          legs:
            (editingPayout.legs?.length ?? 0) > 0
              ? (editingPayout.legs ?? []).map((l) => ({
                  account_id: l.account_id ?? "",
                  amount: String(l.amount),
                }))
              : [{ account_id: "", amount: "" }],
        });
      } else if (initialValuesForCreate) {
        setForm({
          participant_id: participants[0]?.id ?? "",
          payout_date: initialValuesForCreate.payout_date,
          type: "cash",
          total_amount: initialValuesForCreate.total_amount,
          cleaning_percent: defaultCleaning,
          notes: "",
          legs: [
            {
              account_id: initialValuesForCreate.account_id ?? "",
              amount: String(initialValuesForCreate.total_amount),
            },
          ],
        });
      } else {
        setForm({
          participant_id: participants[0]?.id ?? "",
          payout_date: new Date().toISOString().split("T")[0],
          type: "cash",
          total_amount: 0,
          cleaning_percent: defaultCleaning,
          notes: "",
          legs: [{ account_id: "", amount: "" }],
        });
      }
    }
  }, [open, editingPayout, initialValuesForCreate, participants, defaultCleaning]);

  const addLeg = () => {
    setForm((f) => ({ ...f, legs: [...f.legs, { account_id: "", amount: "" }] }));
  };
  const removeLeg = (i: number) => {
    setForm((f) => ({
      ...f,
      legs: f.legs.filter((_, j) => j !== i),
    }));
  };
  const updateLeg = (i: number, field: "account_id" | "amount", value: string) => {
    setForm((f) => ({
      ...f,
      legs: f.legs.map((leg, j) =>
        j === i ? { ...leg, [field]: value } : leg
      ),
    }));
  };

  const legsSum = form.legs.reduce(
    (s, l) => s + (Number(l.amount) || 0),
    0
  );
  const totalAmount = editingPayout ? form.total_amount : legsSum || form.total_amount;
  const credited =
    form.type === "cash"
      ? totalAmount
      : totalAmount * (1 - form.cleaning_percent / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.participant_id) {
      toast({ title: "Оберіть учасника", variant: "destructive" });
      return;
    }
    const total = editingPayout ? (form.total_amount || 0) : legsSum;
    if (!total || total <= 0) {
      toast({ title: "Сума має бути більше 0", variant: "destructive" });
      return;
    }
    const legsParsed = form.legs
      .map((l) => ({ account_id: l.account_id || null, amount: Number(l.amount) || 0 }))
      .filter((l) => l.amount > 0);
    if (legsParsed.length === 0) {
      toast({ title: "Додайте хоча б один рахунок списання", variant: "destructive" });
      return;
    }
    const legsSumCheck = legsParsed.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(legsSumCheck - total) > 0.02) {
      toast({
        title: "Сума по рахунках має дорівнювати загальній сумі",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingPayout) {
        await updatePayout.mutateAsync({
          id: editingPayout.id,
          participant_id: form.participant_id,
          payout_date: form.payout_date,
          type: form.type,
          total_amount: total,
          cleaning_percent: form.type === "non_cash" ? form.cleaning_percent : 0,
          notes: form.notes,
          legs: legsParsed,
        });
        toast({ title: "Виплату оновлено" });
        onSuccess();
      } else {
        const payoutId = await createPayout.mutateAsync({
          participant_id: form.participant_id,
          payout_date: form.payout_date,
          type: form.type,
          total_amount: total,
          cleaning_percent: form.type === "non_cash" ? form.cleaning_percent : 0,
          notes: form.notes,
          legs: legsParsed,
        });
        toast({ title: "Виплату додано" });
        onSuccess(payoutId);
      }
      onOpenChange(false);
    } catch {
      toast({ title: "Помилка збереження", variant: "destructive" });
    }
  };

  const title = editingPayout
    ? "Редагувати виплату"
    : initialValuesForCreate
      ? "Вивести як дівіденд"
      : "Додати виплату";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Учасник</Label>
            <Select
              value={form.participant_id}
              onValueChange={(v) => setForm((f) => ({ ...f, participant_id: v }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Оберіть" />
              </SelectTrigger>
              <SelectContent>
                {participants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.share_percent}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Дата</Label>
            <Input
              type="date"
              value={form.payout_date}
              onChange={(e) => setForm((f) => ({ ...f, payout_date: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Тип</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as "cash" | "non_cash" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.type === "non_cash" && (
            <div>
              <Label>% очистки (податок на обнал)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.cleaning_percent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cleaning_percent: Number(e.target.value) || 0 }))
                }
              />
            </div>
          )}
          {editingPayout ? (
            <div>
              <Label>Загальна сума</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.total_amount || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, total_amount: Number(e.target.value) || 0 }))
                }
              />
            </div>
          ) : null}
          <div>
            <Label>Списання по рахунках (мульти-счета)</Label>
            {form.legs.map((leg, i) => (
              <div key={i} className="flex gap-2 items-center mt-2">
                <Select
                  value={leg.account_id || "_none"}
                  onValueChange={(v) => updateLeg(i, "account_id", v === "_none" ? "" : v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Рахунок" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Без рахунку</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Сума"
                  className="w-28"
                  value={leg.amount}
                  onChange={(e) => updateLeg(i, "amount", e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLeg(i)}
                  disabled={form.legs.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLeg}>
              <Plus className="h-4 w-4 mr-1" /> Додати рахунок
            </Button>
            {!editingPayout && (
              <p className="text-xs text-muted-foreground mt-1">
                Сума по рахунках: {formatCurrency(legsSum)}. В зачёт доли:{" "}
                {formatCurrency(credited)}
              </p>
            )}
          </div>
          <div>
            <Label>Примітка</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" disabled={createPayout.isPending || updatePayout.isPending}>
              Зберегти
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
