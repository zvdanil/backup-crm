/**
 * Railway API client — замінник Supabase client
 * Використовується коли VITE_USE_RAILWAY=true
 */

const API_BASE = import.meta.env.VITE_RAILWAY_API_URL || "";

function getToken(): string | null {
  try {
    const k = "sb-auth-token";
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.access_token ?? null;
  } catch {
    return null;
  }
}

function setToken(token: string) {
  localStorage.setItem("sb-auth-token", JSON.stringify({ access_token: token }));
}

function clearToken() {
  localStorage.removeItem("sb-auth-token");
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const base = API_BASE.replace(/\/$/, "");
  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  const res = await fetch(url, { ...opts, headers });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const d = data as { error?: string | { message?: string } };
    const err =
      typeof d?.error === "string"
        ? d.error
        : (d?.error && typeof d.error === "object" && d.error.message) || res.statusText;
    if (res.status === 500 && import.meta.env.DEV) {
      console.error("[Railway API] 500 відповідь:", { status: res.status, body: data, url: path });
    }
    return { data: null, error: { message: String(err) } };
  }
  return { data, error: null };
}

function from(table: string) {
  const state: {
    filters: Record<string, unknown>;
    range?: { from: number; to: number };
    select?: string;
    order?: string;
    limit?: number;
    updateBody?: Record<string, unknown>;
  } = { filters: {} };
  const chain = {
    select(cols: string = "*", _opts?: { count?: string }) {
      state.select = typeof cols === "string" ? cols : "*";
      return chain;
    },
    eq(col: string, val: unknown) {
      if (col === "id") state.filters.id = val;
      else state.filters[col] = val;
      return chain;
    },
    gte(col: string, val: unknown) {
      (state.filters as Record<string, unknown>).gte = (state.filters as Record<string, unknown>).gte || {};
      ((state.filters as Record<string, Record<string, unknown>>).gte as Record<string, unknown>)[col] = val;
      return chain;
    },
    lte(col: string, val: unknown) {
      (state.filters as Record<string, unknown>).lte = (state.filters as Record<string, unknown>).lte || {};
      ((state.filters as Record<string, Record<string, unknown>>).lte as Record<string, unknown>)[col] = val;
      return chain;
    },
    gt(col: string, val: unknown) {
      (state.filters as Record<string, unknown>).gt = (state.filters as Record<string, unknown>).gt || {};
      ((state.filters as Record<string, Record<string, unknown>>).gt as Record<string, unknown>)[col] = val;
      return chain;
    },
    lt(col: string, val: unknown) {
      (state.filters as Record<string, unknown>).lt = (state.filters as Record<string, unknown>).lt || {};
      ((state.filters as Record<string, Record<string, unknown>>).lt as Record<string, unknown>)[col] = val;
      return chain;
    },
    not(col: string, op: string, val: unknown) {
      if (op === "is" && val === null) {
        (state.filters as Record<string, unknown>).notnull = (state.filters as Record<string, unknown>).notnull || [];
        ((state.filters as Record<string, unknown>).notnull as string[]).push(col);
      }
      return chain;
    },
    in(col: string, vals: unknown[]) {
      (state.filters as Record<string, unknown>).in = (state.filters as Record<string, unknown>).in || {};
      ((state.filters as Record<string, Record<string, unknown>>).in as Record<string, unknown>)[col] = vals;
      return chain;
    },
    range(from: number, to: number) {
      state.range = { from, to };
      return chain;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.order = `${col}.${opts?.ascending === false ? "desc" : "asc"}`;
      return chain;
    },
    limit(n: number) {
      state.limit = n;
      return chain;
    },
    async single() {
      if (state.updateBody) {
        const id = state.filters.id;
        if (id == null) return { data: null, error: { message: "update requires eq('id', value)" } };
        const { data, error } = await apiFetch(`/api/rest/v1/${table}?id=${encodeURIComponent(String(id))}`, {
          method: "PATCH",
          body: JSON.stringify(state.updateBody),
        });
        state.updateBody = undefined;
        return { data, error };
      }
      const id = state.filters.id;
      const params = new URLSearchParams();
      if (state.select) params.set("select", state.select);
      if (id != null) params.set("id", String(id));
      const specialKeys = ["id", "gte", "lte", "gt", "lt", "notnull", "in"];
      for (const [col, val] of Object.entries(state.filters as Record<string, unknown>)) {
        if (specialKeys.includes(col) || val == null) continue;
        params.set(col, String(val));
      }
      for (const col of (state.filters.notnull as string[]) || []) {
        params.set(`notnull_${col}`, "1");
      }
      for (const [col, vals] of Object.entries((state.filters.in as Record<string, unknown[]>) || {})) {
        if (Array.isArray(vals) && vals.length > 0) params.set(`in_${col}`, vals.map(String).join(","));
      }
      if (state.order) params.set("order", state.order);
      if (state.limit) params.set("limit", String(state.limit));
      const q = params.toString();
      const { data, error } = await apiFetch(`/api/rest/v1/${table}${q ? `?${q}` : ""}`);
      if (error) return { data: null, error };
      const arr = Array.isArray(data) ? data : [data];
      const one = arr[0] ?? null;
      return { data: one, error: null };
    },
    async maybeSingle() {
      const r = await chain.single();
      return r;
    },
    async then(resolve: (v: { data: unknown[]; error: { message: string } | null; count?: number | null }) => void) {
      const params = new URLSearchParams();
      if (state.select) params.set("select", state.select);
      if (state.filters.id != null) params.set("id", String(state.filters.id));
      // eq filters (student_id, type, etc.) — передаём как column=value
      const specialKeys = ["id", "gte", "lte", "gt", "lt", "notnull", "in"];
      for (const [col, val] of Object.entries(state.filters as Record<string, unknown>)) {
        if (specialKeys.includes(col) || val == null) continue;
        params.set(col, String(val));
      }
      for (const col of (state.filters.notnull as string[]) || []) {
        params.set(`notnull_${col}`, "1");
      }
      for (const [col, vals] of Object.entries((state.filters.in as Record<string, unknown[]>) || {})) {
        if (Array.isArray(vals) && vals.length > 0) params.set(`in_${col}`, vals.map(String).join(","));
      }
      for (const [col, val] of Object.entries((state.filters as Record<string, unknown>).gte as Record<string, unknown> || {})) {
        params.set(`gte_${col}`, String(val));
      }
      for (const [col, val] of Object.entries((state.filters as Record<string, unknown>).lte as Record<string, unknown> || {})) {
        params.set(`lte_${col}`, String(val));
      }
      for (const [col, val] of Object.entries((state.filters as Record<string, unknown>).gt as Record<string, unknown> || {})) {
        params.set(`gt_${col}`, String(val));
      }
      for (const [col, val] of Object.entries((state.filters as Record<string, unknown>).lt as Record<string, unknown> || {})) {
        params.set(`lt_${col}`, String(val));
      }
      if (state.order) params.set("order", state.order);
      if (state.range) {
        params.set("offset", String(state.range.from));
        params.set("limit", String(state.range.to - state.range.from + 1));
      } else if (state.limit) {
        params.set("limit", String(state.limit));
      } else {
        params.set("limit", "1000");
      }
      const q = params.toString();
      const { data, error } = await apiFetch(`/api/rest/v1/${table}${q ? `?${q}` : ""}`);
      if (error) return resolve({ data: [], error, count: null });
      resolve({ data: Array.isArray(data) ? data : [data], error: null, count: null });
    },
    async insert(body: Record<string, unknown>) {
      const { data, error } = await apiFetch(`/api/rest/v1/${table}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { data, error };
    },
    update(body: Record<string, unknown>) {
      state.updateBody = body;
      return chain;
    },
    async delete() {
      const id = state.filters.id;
      if (id == null) return { data: null, error: { message: "delete requires eq('id', value)" } };
      const { data, error } = await apiFetch(`/api/rest/v1/${table}?id=${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
      return { data: null, error };
    },
  };
  return chain;
}

export const railwayClient = {
  from,
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { data, error } = await apiFetch("/api/auth/v1/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (error) return { data: { user: null, session: null }, error };
      const d = data as { access_token?: string; user?: { id: string; email: string } };
      if (d?.access_token) setToken(d.access_token);
      const user = d?.user ? { id: d.user.id, email: d.user.email } : null;
      const session = user ? { user, access_token: d.access_token } : null;
      return { data: { user, session }, error: null };
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: { parent_name?: string; child_name?: string } };
    }) {
      const meta = options?.data ?? {};
      const { data, error } = await apiFetch("/api/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          parentName: meta.parent_name ?? "",
          childName: meta.child_name ?? "",
        }),
      });
      if (error) return { data: { user: null, session: null }, error };
      const d = data as { access_token?: string; user?: { id: string; email: string } };
      if (d?.access_token) setToken(d.access_token);
      const user = d?.user ? { id: d.user.id, email: d.user.email } : null;
      const session = user ? { user, access_token: d.access_token } : null;
      return { data: { user, session }, error: null };
    },
    async getSession() {
      const token = getToken();
      if (!token) return { data: { session: null }, error: null };
      const { data, error } = await apiFetch("/api/auth/v1/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error || !(data as { user?: unknown })?.user) {
        clearToken();
        return { data: { session: null }, error: null };
      }
      const u = (data as { user: { id: string; email: string } }).user;
      return { data: { session: { user: u, access_token: token } }, error: null };
    },
    async signOut() {
      clearToken();
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void | Promise<void>) {
      const noop = () => {};
      return { data: { subscription: { unsubscribe: noop } } };
    },
  },
  async rpc(name: string, params: Record<string, unknown> = {}) {
    const { data, error } = await apiFetch(`/api/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return { data, error };
  },
};
