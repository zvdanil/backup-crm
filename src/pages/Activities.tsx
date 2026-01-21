import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActivityCard } from '@/components/activities/ActivityCard';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { GroupLessonCard } from '@/components/group-lessons/GroupLessonCard';
import { GroupLessonForm } from '@/components/group-lessons/GroupLessonForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity, useCreateActivityPriceHistory, type Activity } from '@/hooks/useActivities';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useGroupLessons, useCreateGroupLesson, useUpdateGroupLesson, useDeleteGroupLesson, type GroupLesson } from '@/hooks/useGroupLessons';
import { useStaff } from '@/hooks/useStaff';
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
  const [groupLessonSearch, setGroupLessonSearch] = useState('');
  const [tab, setTab] = useState<'activities' | 'group-lessons'>('activities');
  const [formOpen, setFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [groupLessonFormOpen, setGroupLessonFormOpen] = useState(false);
  const [editingGroupLesson, setEditingGroupLesson] = useState<GroupLesson | null>(null);
  const [deletingGroupLessonId, setDeletingGroupLessonId] = useState<string | null>(null);

  const { data: activities = [], isLoading } = useActivities();
  const { data: enrollments = [] } = useEnrollments({ activeOnly: true });
  const { data: staff = [] } = useStaff();
  const { data: groupLessons = [], isLoading: groupLessonsLoading } = useGroupLessons();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const createPriceHistory = useCreateActivityPriceHistory();
  const createGroupLesson = useCreateGroupLesson();
  const updateGroupLesson = useUpdateGroupLesson();
  const deleteGroupLesson = useDeleteGroupLesson();

  const filteredActivities = activities.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroupLessons = groupLessons.filter((lesson) => {
    const haystack = `${lesson.name} ${lesson.activities?.name || ''}`.toLowerCase();
    return haystack.includes(groupLessonSearch.toLowerCase());
  });

  // Count enrollments per activity
  const enrollmentCounts = enrollments.reduce((acc, e) => {
    acc[e.activity_id] = (acc[e.activity_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setFormOpen(true);
  };

  const handleGroupLessonEdit = (lesson: GroupLesson) => {
    setEditingGroupLesson(lesson);
    setGroupLessonFormOpen(true);
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

  const handleGroupLessonSubmit = async (data: { name: string; activity_id: string; staff_ids: string[] }) => {
    if (editingGroupLesson) {
      await updateGroupLesson.mutateAsync({
        id: editingGroupLesson.id,
        name: data.name,
        activity_id: data.activity_id,
        staff_ids: data.staff_ids,
      });
    } else {
      await createGroupLesson.mutateAsync({
        name: data.name,
        activity_id: data.activity_id,
        staff_ids: data.staff_ids,
      });
    }
    setEditingGroupLesson(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteActivity.mutate(deletingId);
      setDeletingId(null);
    }
  };

  const handleGroupLessonDelete = () => {
    if (deletingGroupLessonId) {
      deleteGroupLesson.mutate(deletingGroupLessonId);
      setDeletingGroupLessonId(null);
    }
  };

  const activityOptions = useMemo(
    () => activities.filter((activity) => !['expense', 'household_expense', 'salary'].includes(activity.category)),
    [activities]
  );

  return (
    <>
      <PageHeader 
        title="Активності" 
        description={`${activities.filter(a => a.is_active).length} активних`}
        actions={
          tab === 'activities' ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Додати
            </Button>
          ) : (
            <Button onClick={() => setGroupLessonFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Додати групове
            </Button>
          )
        }
      />
      
      <div className="p-8">
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'activities' | 'group-lessons')}>
          <TabsList>
            <TabsTrigger value="activities">Активності</TabsTrigger>
            <TabsTrigger value="group-lessons">Групові заняття</TabsTrigger>
          </TabsList>

          <TabsContent value="activities" className="mt-6">
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
          </TabsContent>

          <TabsContent value="group-lessons" className="mt-6">
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Пошук групового заняття..."
                  value={groupLessonSearch}
                  onChange={(e) => setGroupLessonSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {groupLessonsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredGroupLessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>Немає групових занять</p>
                <Button variant="link" onClick={() => setGroupLessonFormOpen(true)}>
                  Створити перше групове заняття
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredGroupLessons.map((lesson) => (
                  <GroupLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onEdit={handleGroupLessonEdit}
                    onDelete={setDeletingGroupLessonId}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
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

      <GroupLessonForm
        open={groupLessonFormOpen}
        onOpenChange={(open) => {
          setGroupLessonFormOpen(open);
          if (!open) setEditingGroupLesson(null);
        }}
        onSubmit={handleGroupLessonSubmit}
        initialData={editingGroupLesson || undefined}
        isLoading={createGroupLesson.isPending || updateGroupLesson.isPending}
        activities={activityOptions}
        staff={staff}
      />

      <AlertDialog open={!!deletingGroupLessonId} onOpenChange={() => setDeletingGroupLessonId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити групове заняття?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Всі записи відвідування, повʼязані з заняттям, залишаться без привʼязки.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={handleGroupLessonDelete} className="bg-destructive text-destructive-foreground">
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
