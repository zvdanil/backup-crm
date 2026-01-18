import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePaymentAccounts,
  useCreatePaymentAccount,
  useUpdatePaymentAccount,
  useDeletePaymentAccount,
  type PaymentAccount,
} from '@/hooks/usePaymentAccounts';
import { PaymentAccountCard } from '@/components/accounts/PaymentAccountCard';
import { PaymentAccountForm } from '@/components/accounts/PaymentAccountForm';

export default function Accounts() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = usePaymentAccounts();
  const createAccount = useCreatePaymentAccount();
  const updateAccount = useUpdatePaymentAccount();
  const deleteAccount = useDeletePaymentAccount();

  const filteredAccounts = accounts.filter((account) =>
    account.name.toLowerCase().includes(search.toLowerCase()) ||
    account.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (account: PaymentAccount) => {
    setEditingAccount(account);
    setFormOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (editingAccount) {
      updateAccount.mutate({ id: editingAccount.id, ...data });
    } else {
      createAccount.mutate(data);
    }
    setEditingAccount(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteAccount.mutate(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Рахунки"
        description={`${accounts.length} рахунків`}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Додати
          </Button>
        }
      />

      <div className="p-8">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Пошук рахунку..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає рахунків</p>
            <Button variant="link" onClick={() => setFormOpen(true)}>
              Створити перший рахунок
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAccounts.map((account) => (
              <PaymentAccountCard
                key={account.id}
                account={account}
                onEdit={handleEdit}
                onDelete={setDeletingId}
              />
            ))}
          </div>
        )}
      </div>

      <PaymentAccountForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAccount(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingAccount || undefined}
        isLoading={createAccount.isPending || updateAccount.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити рахунок?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Активності будуть відвʼязані від рахунку.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
