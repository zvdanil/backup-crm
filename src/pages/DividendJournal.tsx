import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useDividendParticipants,
  useDividendSettings,
  useUpdateDividendSettings,
  useDividendPayouts,
  useCreateDividendPayout,
  useUpdateDividendPayout,
  useDeleteDividendPayout,
  useCreateDividendParticipant,
  useUpdateDividendParticipant,
  useDeleteDividendParticipant,
  computeDividendSummary,
  type DividendParticipant,
  type DividendPayout,
} from "@/hooks/useDividendJournal";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import { formatCurrency, formatLocalDate, getMonthStartDate } from "@/lib/attendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Users, Settings, Scale } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DividendPayoutFormDialog, PAYOUT_TYPES } from "@/components/dividend/DividendPayoutFormDialog";

export default function DividendJournal() {
  const { data: participants = [] } = useDividendParticipants();
  const { data: settings } = useDividendSettings();
  const updateSettings = useUpdateDividendSettings();
  const { data: accounts = [] } = usePaymentAccounts();

  const [periodMode, setPeriodMode] = useState<"all" | "period">("all");
  const [periodFrom, setPeriodFrom] = useState(() =>
    getMonthStartDate(new Date().getFullYear(), 0)
  );
  const [periodTo, setPeriodTo] = useState(() =>
    formatLocalDate(new Date())
  );

  const filter: { mode: "all" } | { mode: "period"; from: string; to: string } =
    periodMode === "all"
      ? { mode: "all" }
      : { mode: "period", from: periodFrom, to: periodTo };

  const { data: payouts = [], isLoading } = useDividendPayouts(filter);
  const createPayout = useCreateDividendPayout();
  const updatePayout = useUpdateDividendPayout();
  const deletePayout = useDeleteDividendPayout();
  const createParticipant = useCreateDividendParticipant();
  const updateParticipant = useUpdateDividendParticipant();
  const deleteParticipant = useDeleteDividendParticipant();

  const summary = useMemo(
    () => computeDividendSummary(payouts, participants),
    [payouts, participants]
  );

  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<DividendPayout | null>(null);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);

  const defaultCleaning = settings?.default_cleaning_percent ?? 20;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Журнал дивідендів"
        description="Облік виведення прибутку та розподіл за долями"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setParticipantsDialogOpen(true)}>
              <Users className="h-4 w-4 mr-2" />
              Учасники
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsDialogOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Налаштування
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBalanceDialogOpen(true)}>
              <Scale className="h-4 w-4 mr-2" />
              Вирівняти баланс
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingPayout(null);
                setPayoutDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Додати виплату
            </Button>
          </>
        }
      />

      {/* Period filter */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Період</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Режим:</Label>
            <Select
              value={periodMode}
              onValueChange={(v) => setPeriodMode(v as "all" | "period")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі виплати</SelectItem>
                <SelectItem value="period">За період</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodMode === "period" && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-sm">З:</Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-[140px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">По:</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-[140px]"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary header */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summary.byParticipant.map(({ participant, actual, share, skew }) => (
          <Card key={participant.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{participant.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Доля {participant.share_percent}%
              </p>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm">
                Отримано (еквівалент): <strong>{formatCurrency(actual)}</strong>
              </p>
              <p className="text-sm">
                Причиталось: <strong>{formatCurrency(share)}</strong>
              </p>
              <p
                className={`text-sm font-medium ${
                  skew > 0 ? "text-green-600" : skew < 0 ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                Перекос: {formatCurrency(skew)}
                {skew > 0 && " (переплата)"}
                {skew < 0 && " (недоплата)"}
              </p>
            </CardContent>
          </Card>
        ))}
        {participants.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              Додайте учасників у розділі «Учасники».
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payouts table */}
      <Card>
        <CardHeader>
          <CardTitle>Виплати</CardTitle>
          <p className="text-sm text-muted-foreground">
            Всього в зачёт (еквівалент): {formatCurrency(summary.totalCredited)}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Завантаження…</p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Немає виплат за обраний період.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Учасник</TableHead>
                  <TableHead>Джерело</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead className="text-right">Сума</TableHead>
                  <TableHead className="text-right">% очистки</TableHead>
                  <TableHead className="text-right">В зачёт доли</TableHead>
                  <TableHead>Рахунки</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payout_date}</TableCell>
                    <TableCell>{p.participant?.name ?? p.participant_id}</TableCell>
                    <TableCell>{p.source_label || "—"}</TableCell>
                    <TableCell>
                      {PAYOUT_TYPES.find((t) => t.value === p.type)?.label ?? p.type}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(p.total_amount)}</TableCell>
                    <TableCell className="text-right">
                      {p.type === "non_cash" ? `${p.cleaning_percent}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.credited_amount)}
                    </TableCell>
                    <TableCell>
                      {p.legs?.length
                        ? p.legs
                            .map(
                              (l) =>
                                `${l.account_id ? (accounts.find((a) => a.id === l.account_id)?.name ?? l.account_id) : "Без рахунку"}: ${formatCurrency(l.amount)}`
                            )
                            .join("; ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingPayout(p);
                            setPayoutDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (!confirm("Видалити цю виплату?")) return;
                            try {
                              await deletePayout.mutateAsync(p.id);
                              toast({ title: "Виплату видалено" });
                            } catch {
                              toast({ title: "Помилка", variant: "destructive" });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Payout Dialog */}
      <DividendPayoutFormDialog
        open={payoutDialogOpen}
        onOpenChange={setPayoutDialogOpen}
        participants={participants}
        accounts={accounts}
        defaultCleaning={defaultCleaning}
        editingPayout={editingPayout}
        onSuccess={() => {
          setPayoutDialogOpen(false);
          setEditingPayout(null);
        }}
        createPayout={createPayout}
        updatePayout={updatePayout}
      />

      {/* Participants Dialog */}
      <ParticipantsDialog
        open={participantsDialogOpen}
        onOpenChange={setParticipantsDialogOpen}
        participants={participants}
        createParticipant={createParticipant}
        updateParticipant={updateParticipant}
        deleteParticipant={deleteParticipant}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        defaultCleaningPercent={defaultCleaning}
        onSave={async (value) => {
          await updateSettings.mutateAsync(value);
          toast({ title: "Збережено" });
          setSettingsDialogOpen(false);
        }}
      />

      {/* Balance recommendation Dialog */}
      <BalanceRecommendationDialog
        open={balanceDialogOpen}
        onOpenChange={setBalanceDialogOpen}
        summary={summary}
      />
    </div>
  );
}

// --- Participants management ---

function ParticipantsDialog({
  open,
  onOpenChange,
  participants,
  createParticipant,
  updateParticipant,
  deleteParticipant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: DividendParticipant[];
  createParticipant: ReturnType<typeof useCreateDividendParticipant>;
  updateParticipant: ReturnType<typeof useUpdateDividendParticipant>;
  deleteParticipant: ReturnType<typeof useDeleteDividendParticipant>;
}) {
  const [name, setName] = useState("");
  const [share, setShare] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editShare, setEditShare] = useState("");

  const totalShare = participants.reduce((s, p) => s + p.share_percent, 0);
  const isValid = Math.abs(totalShare - 100) < 0.01;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const shareNum = Number(share);
    if (!name.trim() || isNaN(shareNum) || shareNum < 0 || shareNum > 100) {
      toast({ title: "Ім'я та частка (0–100) обов'язкові", variant: "destructive" });
      return;
    }
    const newTotal = totalShare + shareNum;
    if (newTotal > 100.01) {
      toast({ title: "Сума часток не може перевищувати 100%", variant: "destructive" });
      return;
    }
    try {
      await createParticipant.mutateAsync({
        name: name.trim(),
        share_percent: shareNum,
        sort_order: participants.length,
      });
      setName("");
      setShare("");
      toast({ title: "Учасника додано" });
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  const startEdit = (p: DividendParticipant) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditShare(String(p.share_percent));
  };
  const handleSaveEdit = async () => {
    if (!editingId) return;
    const shareNum = Number(editShare);
    if (!editName.trim() || isNaN(shareNum) || shareNum < 0 || shareNum > 100) {
      toast({ title: "Невірні дані", variant: "destructive" });
      return;
    }
    const othersTotal = participants.filter((x) => x.id !== editingId).reduce((s, x) => s + x.share_percent, 0);
    if (othersTotal + shareNum > 100.01) {
      toast({ title: "Сума часток не може перевищувати 100%", variant: "destructive" });
      return;
    }
    try {
      await updateParticipant.mutateAsync({
        id: editingId,
        name: editName.trim(),
        share_percent: shareNum,
      });
      setEditingId(null);
      toast({ title: "Збережено" });
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Видалити учасника? Виплати за ним залишаться без прив'язки.")) return;
    try {
      await deleteParticipant.mutateAsync(id);
      toast({ title: "Учасника видалено" });
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Учасники журналу дивідендів</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Сума часток має дорівнювати 100%. Поточна сума: {totalShare.toFixed(1)}%
            {!isValid && (
              <span className="text-destructive ml-1"> (потрібно 100%)</span>
            )}
          </p>
        </DialogHeader>
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Ім'я"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              placeholder="%"
              className="w-20"
              value={share}
              onChange={(e) => setShare(e.target.value)}
            />
            <Button type="submit" size="sm">
              Додати
            </Button>
          </div>
        </form>
        <ul className="space-y-2 max-h-60 overflow-auto">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 border rounded p-2">
              {editingId === p.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className="w-16"
                    value={editShare}
                    onChange={(e) => setEditShare(e.target.value)}
                  />
                  <Button size="sm" onClick={handleSaveEdit}>
                    Зберегти
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Скасувати
                  </Button>
                </>
              ) : (
                <>
                  <span>
                    {p.name} — {p.share_percent}%
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Settings (default cleaning %) ---

function SettingsDialog({
  open,
  onOpenChange,
  defaultCleaningPercent,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCleaningPercent: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(defaultCleaningPercent));
  React.useEffect(() => {
    if (open) setValue(String(defaultCleaningPercent));
  }, [open, defaultCleaningPercent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Налаштування журналу дивідендів</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Процент очистки (податок на обнал) за замовчуванням для безналичних виплат.
          </p>
        </DialogHeader>
        <div>
          <Label>% очистки за замовчуванням</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            onClick={async () => {
              const num = Number(value);
              if (isNaN(num) || num < 0 || num > 100) {
                toast({ title: "Введіть число від 0 до 100", variant: "destructive" });
                return;
              }
              await onSave(num);
            }}
          >
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Balance recommendation ---

function BalanceRecommendationDialog({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ReturnType<typeof computeDividendSummary>;
}) {
  const underpaid = summary.byParticipant.filter((x) => x.skew < -0.01);
  const overpaid = summary.byParticipant.filter((x) => x.skew > 0.01);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Вирівняти баланс</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Рекомендації, щоб привести перекос усіх учасників до нуля (виплати наличними).
          </p>
        </DialogHeader>
        <div className="space-y-3">
          {underpaid.length === 0 && overpaid.length === 0 && (
            <p className="text-sm">Баланс уже вирівняний.</p>
          )}
          {underpaid.length > 0 && (
            <div>
              <p className="text-sm font-medium">Винаплатити наличними:</p>
              <ul className="list-disc list-inside text-sm mt-1">
                {underpaid.map(({ participant, skew }) => (
                  <li key={participant.id}>
                    {participant.name}: {formatCurrency(Math.abs(skew))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overpaid.length > 0 && (
            <div>
              <p className="text-sm font-medium">Переплата (отримали більше причитального):</p>
              <ul className="list-disc list-inside text-sm mt-1">
                {overpaid.map(({ participant, skew }) => (
                  <li key={participant.id}>
                    {participant.name}: {formatCurrency(skew)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Закрити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
