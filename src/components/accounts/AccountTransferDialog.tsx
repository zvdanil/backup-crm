import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useCreateAccountTransfer } from '@/hooks/useAccountTransfers';
import { formatCurrency } from '@/lib/attendance';

const transferSchema = z.object({
  from_account_id: z.string().min(1, 'Оберіть рахунок-джерело'),
  to_account_id: z.string().min(1, 'Оберіть рахунок-отримувач'),
  amount: z.coerce.number().positive('Сума повинна бути більше 0'),
  transfer_date: z.string().min(1, 'Оберіть дату'),
  description: z.string().optional(),
}).refine((data) => data.from_account_id !== data.to_account_id, {
  message: 'Рахунок-джерело та рахунок-отримувач повинні бути різними',
  path: ['to_account_id'],
});

type TransferFormValues = z.infer<typeof transferSchema>;

interface AccountTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromAccountId?: string;
}

export function AccountTransferDialog({
  open,
  onOpenChange,
  defaultFromAccountId,
}: AccountTransferDialogProps) {
  const { data: accounts = [] } = usePaymentAccounts();
  const createTransfer = useCreateAccountTransfer();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account_id: defaultFromAccountId || '',
      to_account_id: '',
      amount: 0,
      transfer_date: new Date().toISOString().split('T')[0],
      description: '',
    },
  });

  const fromAccountId = form.watch('from_account_id');
  const toAccountId = form.watch('to_account_id');
  const amount = form.watch('amount');

  // Filter out the selected from account from to account options
  const availableToAccounts = accounts.filter(
    (account) => account.id !== fromAccountId && account.is_active
  );

  // Filter out the selected to account from from account options
  const availableFromAccounts = accounts.filter(
    (account) => account.id !== toAccountId && account.is_active
  );

  const onSubmit = async (data: TransferFormValues) => {
    try {
      await createTransfer.mutateAsync({
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: data.amount,
        transfer_date: data.transfer_date,
        description: data.description || null,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Переказ між рахунками</DialogTitle>
          <DialogDescription>
            Створіть переказ коштів з одного рахунку на інший. Це створить дві транзакції:
            витрату з рахунку-джерела та надходження на рахунок-отримувач.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="from_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Рахунок-джерело</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Оберіть рахунок-джерело" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableFromAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Рахунок-отримувач</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Оберіть рахунок-отримувач" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableToAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Сума</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  {amount > 0 && (
                    <FormDescription>
                      {formatCurrency(amount)}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transfer_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Дата переказу</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Опис (необов'язково)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Додайте опис переказу..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createTransfer.isPending}
              >
                Скасувати
              </Button>
              <Button type="submit" disabled={createTransfer.isPending}>
                {createTransfer.isPending ? 'Виконується...' : 'Виконати переказ'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
