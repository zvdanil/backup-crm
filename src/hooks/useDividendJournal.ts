import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const supabaseAny = supabase as any;

export type DividendParticipant = {
  id: string;
  name: string;
  share_percent: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type DividendPayoutLeg = {
  id?: string;
  payout_id?: string;
  account_id: string | null;
  amount: number;
};

export type DividendPayout = {
  id: string;
  participant_id: string;
  payout_date: string;
  type: "cash" | "non_cash";
  total_amount: number;
  cleaning_percent: number;
  credited_amount: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  legs?: DividendPayoutLeg[];
  participant?: DividendParticipant;
  source_label?: string | null;
};

// --- Participants ---

export function useDividendParticipants() {
  return useQuery({
    queryKey: ["dividend_participants"],
    queryFn: async (): Promise<DividendParticipant[]> => {
      const { data, error } = await supabaseAny
        .from("dividend_participants")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        share_percent: Number(r.share_percent),
      }));
    },
  });
}

export function useCreateDividendParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; share_percent: number; sort_order?: number }) => {
      const { data, error } = await supabaseAny
        .from("dividend_participants")
        .insert({
          name: payload.name,
          share_percent: payload.share_percent,
          sort_order: payload.sort_order ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_participants"] });
    },
  });
}

export function useUpdateDividendParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      share_percent,
      sort_order,
    }: {
      id: string;
      name?: string;
      share_percent?: number;
      sort_order?: number;
    }) => {
      const body: any = {};
      if (name !== undefined) body.name = name;
      if (share_percent !== undefined) body.share_percent = share_percent;
      if (sort_order !== undefined) body.sort_order = sort_order;
      const { error } = await supabaseAny.from("dividend_participants").update(body).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_participants"] });
    },
  });
}

export function useDeleteDividendParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseAny.from("dividend_participants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_participants"] });
      qc.invalidateQueries({ queryKey: ["dividend_payouts"] });
    },
  });
}

// --- Settings (default cleaning %) ---

export function useDividendSettings() {
  return useQuery({
    queryKey: ["dividend_settings"],
    queryFn: async () => {
      const { data, error } = await supabaseAny
        .from("dividend_settings")
        .select("key, value_json")
        .eq("key", "default_cleaning_percent")
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value_json ?? "20";
      return { default_cleaning_percent: Number(raw) };
    },
  });
}

export function useUpdateDividendSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (default_cleaning_percent: number) => {
      const { error } = await supabaseAny
        .from("dividend_settings")
        .upsert(
          { key: "default_cleaning_percent", value_json: String(default_cleaning_percent), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_settings"] });
    },
  });
}

// --- Payouts (with optional date filter) ---

type PayoutsFilter = { mode: "all" } | { mode: "period"; from: string; to: string };

export function useDividendPayouts(filter: PayoutsFilter) {
  return useQuery({
    queryKey: ["dividend_payouts", filter],
    queryFn: async (): Promise<DividendPayout[]> => {
      let query = supabaseAny
        .from("dividend_payouts")
        .select(
          `
          *,
          participant:dividend_participants(id, name, share_percent, sort_order)
        `
        )
        .order("payout_date", { ascending: false });

      if (filter.mode === "period") {
        query = query.gte("payout_date", filter.from).lte("payout_date", filter.to);
      }

      const { data: payouts, error } = await query;
      if (error) throw error;

      const payoutIds = (payouts || []).map((p: any) => p.id);
      if (payoutIds.length === 0) {
        return (payouts || []).map(normalizePayout);
      }

      const sourceByPayoutId = new Map<string, string>();
      const appendSourceLabel = (payoutId: string, label: string) => {
        const existing = sourceByPayoutId.get(payoutId);
        if (!existing) {
          sourceByPayoutId.set(payoutId, label);
          return;
        }
        if (!existing.includes(label)) {
          sourceByPayoutId.set(payoutId, `${existing}; ${label}`);
        }
      };

      // Source from salary journal: linked staff payout
      const { data: linkedStaffPayouts, error: linkedStaffPayoutsError } = await supabaseAny
        .from("staff_payouts")
        .select("id, dividend_payout_id")
        .in("dividend_payout_id", payoutIds);
      if (linkedStaffPayoutsError) throw linkedStaffPayoutsError;
      (linkedStaffPayouts || []).forEach((row: any) => {
        if (row.dividend_payout_id) {
          appendSourceLabel(row.dividend_payout_id, "Журнал ЗП");
        }
      });

      // Source from expense/salary transactions: linked finance transaction
      const { data: linkedTransactions, error: linkedTransactionsError } = await supabaseAny
        .from("finance_transactions")
        .select("id, dividend_payout_id, type")
        .in("dividend_payout_id", payoutIds);
      if (linkedTransactionsError) throw linkedTransactionsError;
      (linkedTransactions || []).forEach((row: any) => {
        if (!row.dividend_payout_id) return;
        if (row.type === "salary") {
          appendSourceLabel(row.dividend_payout_id, "Журнал ЗП");
          return;
        }
        if (row.type === "expense" || row.type === "household") {
          appendSourceLabel(row.dividend_payout_id, "Журнал витрат");
        }
      });

      const { data: legs, error: legsError } = await supabaseAny
        .from("dividend_payout_legs")
        .select("*")
        .in("payout_id", payoutIds);
      if (legsError) throw legsError;

      const legsByPayout = new Map<string, any[]>();
      (legs || []).forEach((leg: any) => {
        if (!legsByPayout.has(leg.payout_id)) legsByPayout.set(leg.payout_id, []);
        legsByPayout.get(leg.payout_id)!.push(leg);
      });

      return (payouts || []).map((p: any) =>
        normalizePayout(
          p,
          legsByPayout.get(p.id) || [],
          sourceByPayoutId.get(p.id) || null
        )
      );
    },
  });
}

function normalizePayout(
  p: any,
  legs: any[] = [],
  sourceLabel: string | null = null
): DividendPayout {
  return {
    id: p.id,
    participant_id: p.participant_id,
    payout_date: p.payout_date,
    type: p.type,
    total_amount: Number(p.total_amount),
    cleaning_percent: Number(p.cleaning_percent),
    credited_amount: Number(p.credited_amount),
    notes: p.notes,
    created_at: p.created_at,
    updated_at: p.updated_at,
    legs: legs.map((l) => ({
      id: l.id,
      payout_id: l.payout_id,
      account_id: l.account_id,
      amount: Number(l.amount),
    })),
    participant: p.participant
      ? {
          id: p.participant.id,
          name: p.participant.name,
          share_percent: Number(p.participant.share_percent),
          sort_order: Number(p.participant.sort_order ?? 0),
        }
      : undefined,
    source_label: sourceLabel,
  };
}

export function useCreateDividendPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      participant_id: string;
      payout_date: string;
      type: "cash" | "non_cash";
      total_amount: number;
      cleaning_percent: number;
      notes?: string;
      legs: { account_id: string | null; amount: number }[];
    }) => {
      const credited =
        payload.type === "cash"
          ? payload.total_amount
          : payload.total_amount * (1 - payload.cleaning_percent / 100);
      const { data: payout, error: payoutError } = await supabaseAny
        .from("dividend_payouts")
        .insert({
          participant_id: payload.participant_id,
          payout_date: payload.payout_date,
          type: payload.type,
          total_amount: payload.total_amount,
          cleaning_percent: payload.cleaning_percent,
          credited_amount: Math.round(credited * 100) / 100,
          notes: payload.notes || null,
        })
        .select("id")
        .single();
      if (payoutError) throw payoutError;

      if (payload.legs.length > 0) {
        const { error: legsError } = await supabaseAny.from("dividend_payout_legs").insert(
          payload.legs.map((l) => ({
            payout_id: payout.id,
            account_id: l.account_id || null,
            amount: l.amount,
          }))
        );
        if (legsError) throw legsError;
      }
      return payout.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_payouts"] });
      qc.invalidateQueries({ queryKey: ["account_transactions"] });
    },
  });
}

export function useUpdateDividendPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      participant_id: string;
      payout_date: string;
      type: "cash" | "non_cash";
      total_amount: number;
      cleaning_percent: number;
      notes?: string;
      legs: { account_id: string | null; amount: number }[];
    }) => {
      const { id, legs, ...rest } = payload;
      const credited =
        rest.type === "cash"
          ? rest.total_amount
          : Math.round(rest.total_amount * (1 - rest.cleaning_percent / 100) * 100) / 100;
      const { error } = await supabaseAny
        .from("dividend_payouts")
        .update({
          participant_id: rest.participant_id,
          payout_date: rest.payout_date,
          type: rest.type,
          total_amount: rest.total_amount,
          cleaning_percent: rest.cleaning_percent,
          credited_amount: credited,
          notes: rest.notes || null,
        })
        .eq("id", id);
      if (error) throw error;

      await supabaseAny.from("dividend_payout_legs").delete().eq("payout_id", id);
      if (legs.length > 0) {
        const { error: legsError } = await supabaseAny.from("dividend_payout_legs").insert(
          legs.map((l) => ({ payout_id: id, account_id: l.account_id || null, amount: l.amount }))
        );
        if (legsError) throw legsError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_payouts"] });
      qc.invalidateQueries({ queryKey: ["account_transactions"] });
    },
  });
}

export function useDeleteDividendPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseAny.from("dividend_payouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dividend_payouts"] });
      qc.invalidateQueries({ queryKey: ["account_transactions"] });
    },
  });
}

// --- Summary & skew (for header and "выровнять баланс") ---

export function computeDividendSummary(
  payouts: DividendPayout[],
  participants: DividendParticipant[]
): {
  totalCredited: number;
  byParticipant: {
    participant: DividendParticipant;
    actual: number;
    share: number;
    skew: number;
  }[];
} {
  const totalCredited = payouts.reduce((s, p) => s + p.credited_amount, 0);
  const byParticipant = participants.map((participant) => {
    const actual = payouts
      .filter((p) => p.participant_id === participant.id)
      .reduce((s, p) => s + p.credited_amount, 0);
    const share = totalCredited * (participant.share_percent / 100);
    const skew = actual - share;
    return { participant, actual, share, skew };
  });
  return { totalCredited, byParticipant };
}
