/**
 * Обхід ліміту Supabase 1000 рядків: завантажує всі рядки по сторінках по 999.
 */
const PAGE_SIZE = 999;

export async function fetchAllRows<T = any>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const chunk = (data || []) as T[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from = to + 1;
  }
  return all;
}
