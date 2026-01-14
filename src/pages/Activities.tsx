import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActivityCard } from '@/components/activities/ActivityCard';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity, useCreateActivityPriceHistory, type Activity } from '@/hooks/useActivities';
import { useEnrollments } from '@/hooks/useEnrollments';
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

export default function Activities() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: activities = [], isLoading } = useActivities();
  const { data: enrollments = [] } = useEnrollments({ activeOnly: true });
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const createPriceHistory = useCreateActivityPriceHistory();

  const filteredActivities = activities.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  // Count enrollments per activity
  const enrollmentCounts = enrollments.reduce((acc, e) => {
    acc[e.activity_id] = (acc[e.activity_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setFormOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingActivity) {
      // Перевіряємо чи змінилися billing_rules
      const billingRulesChanged = JSON.stringify(editingActivity.billing_rules) !== JSON.stringify(data.billing_rules);
      
      // Виділяємо effective_from та effective_to, щоб не відправляти їх в таблицю activities
      // (ці поля тільки для activity_price_history)
      const { effective_from, effective_to, ...activityData } = data;
      
      // Оновлюємо активність (БЕЗ effective_from та effective_to)
      await updateActivity.mutateAsync({ id: editingActivity.id, ...activityData });
      
      // Якщо змінилися billing_rules та вказана effective_from - створюємо запис в історії
      if (billingRulesChanged && data.billing_rules && effective_from) {
        await createPriceHistory.mutateAsync({
          activity_id: editingActivity.id,
          billing_rules: data.billing_rules,
          effective_from: effective_from,
        });
      }
    } else {
      // Для нової активності також не передаємо effective_from та effective_to в основну таблицю
      const { effective_from, effective_to, ...activityData } = data;
      
      // Створюємо активність (БЕЗ effective_from та effective_to)
      const createdActivity = await createActivity.mutateAsync(activityData);
      
      // Якщо вказана effective_from та є billing_rules - створюємо запис в історії
      if (createdActivity && data.billing_rules && effective_from) {
        await createPriceHistory.mutateAsync({
          activity_id: createdActivity.id,
          billing_rules: data.billing_rules,
          effective_from: effective_from,
        });
      }
    }
    setEditingActivity(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteActivity.mutate(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader 
        title="Активності" 
        description={`${activities.filter(a => a.is_active).length} активних`}
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
              placeholder="Пошук активності..."
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
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає активностей</p>
            <Button variant="link" onClick={() => setFormOpen(true)}>
              Створити першу активність
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                enrolledCount={enrollmentCounts[activity.id] || 0}
                onEdit={handleEdit}
                onDelete={setDeletingId}
              />
            ))}
          </div>
        )}
      </div>

      <ActivityForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingActivity(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingActivity || undefined}
        isLoading={createActivity.isPending || updateActivity.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити активність?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Всі записи та дані про відвідуваність будуть видалені.
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
