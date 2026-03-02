import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLocalDate } from "@/lib/attendance";

interface ChangeEnrollmentPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityName: string;
  initialCustomPrice: number | null;
  initialDiscount: number | null;
  initialEffectiveFrom: string | null;
  isLoading?: boolean;
  onSubmit: (payload: {
    custom_price: number | null;
    discount_percent: number;
    effective_from: string;
    apply_mode: "future" | "recalc_range";
    recalc_from?: string;
    recalc_to?: string;
  }) => Promise<void> | void;
}

export function ChangeEnrollmentPriceDialog({
  open,
  onOpenChange,
  activityName,
  initialCustomPrice,
  initialDiscount,
  initialEffectiveFrom,
  isLoading = false,
  onSubmit,
}: ChangeEnrollmentPriceDialogProps) {
  const [customPrice, setCustomPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(formatLocalDate(new Date()));
  const [applyMode, setApplyMode] = useState<"future" | "recalc_range">("future");
  const [recalcFrom, setRecalcFrom] = useState("");
  const [recalcTo, setRecalcTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomPrice(initialCustomPrice?.toString() || "");
    setDiscountPercent(initialDiscount?.toString() || "0");
    setEffectiveFrom(initialEffectiveFrom || formatLocalDate(new Date()));
    setApplyMode("future");
    setRecalcFrom("");
    setRecalcTo("");
    setFormError(null);
  }, [open, initialCustomPrice, initialDiscount, initialEffectiveFrom]);

  const handleSubmit = async () => {
    setFormError(null);

    if (!effectiveFrom) {
      setFormError("Оберіть дату початку дії.");
      return;
    }

    const parsedPrice = customPrice.trim() === "" ? null : Number(customPrice);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setFormError("Ціна повинна бути числом більше або дорівнювати 0.");
      return;
    }

    const parsedDiscount = Number(discountPercent);
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      setFormError("Знижка повинна бути в діапазоні 0-100%.");
      return;
    }

    if (applyMode === "recalc_range") {
      if (!recalcFrom || !recalcTo) {
        setFormError("Для перерахунку вкажіть обидві дати діапазону.");
        return;
      }
      if (recalcFrom > recalcTo) {
        setFormError("Дата 'З дати' не може бути пізніше за 'По дату'.");
        return;
      }
    }

    await onSubmit({
      custom_price: parsedPrice,
      discount_percent: parsedDiscount,
      effective_from: effectiveFrom,
      apply_mode: applyMode,
      recalc_from: recalcFrom || undefined,
      recalc_to: recalcTo || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Змінити ціну активності</DialogTitle>
          <p className="text-sm text-muted-foreground">{activityName}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Зміна ціни фіксується через серверний API, після чого запускається оновлення
            пов'язаних балансів.
          </div>

          <div className="space-y-2">
            <Label htmlFor="change_price_custom_price">Нова ціна (₴)</Label>
            <Input
              id="change_price_custom_price"
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="Залиште порожнім для стандартної"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="change_price_discount">Знижка (%)</Label>
            <Input
              id="change_price_discount"
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="change_price_effective_from">Дата початку дії</Label>
            <Input
              id="change_price_effective_from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Режим застосування</Label>
            <Select
              value={applyMode}
              onValueChange={(value) =>
                setApplyMode(value as "future" | "recalc_range")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="future">Тільки з цієї дати</SelectItem>
                <SelectItem value="recalc_range">
                  З перерахунком у діапазоні
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {applyMode === "recalc_range" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="change_price_recalc_from">З дати</Label>
                <Input
                  id="change_price_recalc_from"
                  type="date"
                  value={recalcFrom}
                  onChange={(e) => setRecalcFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="change_price_recalc_to">По дату</Label>
                <Input
                  id="change_price_recalc_to"
                  type="date"
                  value={recalcTo}
                  onChange={(e) => setRecalcTo(e.target.value)}
                />
              </div>
            </div>
          )}

          {formError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Закрити
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Збереження...
                </>
              ) : (
                "Зберегти"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

