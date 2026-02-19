/**
 * RPC endpoints — заміна supabase.rpc()
 *
 * POST /rpc/get_user_profiles_with_email
 * POST /rpc/create_account_transfer
 * POST /rpc/cancel_account_transfer
 */

import { Router } from "express";

export const rpcRouter = Router();

rpcRouter.post("/get_user_profiles_with_email", async (req, res) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM public.get_user_profiles_with_email()");
    res.json(rows);
  } catch (e) {
    console.error("[RPC get_user_profiles_with_email]", e);
    res.status(500).json({ error: e.message });
  }
});

rpcRouter.post("/create_account_transfer", async (req, res) => {
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.create_account_transfer($1, $2, $3, $4, $5, $6)",
      [
        req.body.from_account_id,
        req.body.to_account_id,
        req.body.amount,
        req.body.transfer_date,
        req.body.notes ?? null,
        req.body.created_by ?? null,
      ]
    );
    res.json(rows[0] ?? {});
  } catch (e) {
    console.error("[RPC create_account_transfer]", e);
    res.status(500).json({ error: e.message });
  }
});

rpcRouter.post("/cancel_account_transfer", async (req, res) => {
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.cancel_account_transfer($1, $2)",
      [req.body.transfer_id, req.body.cancelled_by ?? null]
    );
    res.json(rows[0] ?? {});
  } catch (e) {
    console.error("[RPC cancel_account_transfer]", e);
    res.status(500).json({ error: e.message });
  }
});
