import { PageHeader } from '@/components/layout/PageHeader';

export default function PendingActivation() {
  return (
    <>
      <PageHeader title="Очікує активації" description="Доступ обмежено" />
      <div className="p-8">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <div className="text-lg font-semibold">Очікуйте активації облікового запису</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваш акаунт створено, але ще не активований адміністратором. Після активації доступ буде відкрито.
          </p>
        </div>
      </div>
    </>
  );
}
