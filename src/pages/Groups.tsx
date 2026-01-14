import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { GroupCard } from '@/components/groups/GroupCard';
import { GroupForm } from '@/components/groups/GroupForm';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, type Group } from '@/hooks/useGroups';
import { useStudents } from '@/hooks/useStudents';
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

export default function Groups() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: groups = [], isLoading } = useGroups();
  const { data: students = [] } = useStudents();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Count students per group
  const studentCounts = students.reduce((acc, s) => {
    if (s.group_id) {
      acc[s.group_id] = (acc[s.group_id] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleEdit = (group: Group) => {
    setEditingGroup(group);
    setFormOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (editingGroup) {
      updateGroup.mutate({ id: editingGroup.id, ...data });
    } else {
      createGroup.mutate(data);
    }
    setEditingGroup(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteGroup.mutate(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader 
        title="Групи" 
        description={`${groups.length} груп`}
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
              placeholder="Пошук групи..."
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
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає груп</p>
            <Button variant="link" onClick={() => setFormOpen(true)}>
              Створити першу групу
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                studentsCount={studentCounts[group.id] || 0}
                onEdit={handleEdit}
                onDelete={setDeletingId}
              />
            ))}
          </div>
        )}
      </div>

      <GroupForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingGroup(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingGroup || undefined}
        isLoading={createGroup.isPending || updateGroup.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити групу?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Група буде видалена, але діти залишаться (без групи).
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
