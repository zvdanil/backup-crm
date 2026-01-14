import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaffForm } from '@/components/staff/StaffForm';
import { StaffCard } from '@/components/staff/StaffCard';
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, type Staff } from '@/hooks/useStaff';
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

export default function Staff() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: staff = [], isLoading } = useStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const filteredStaff = staff.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.position?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    setFormOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (editingStaff) {
      updateStaff.mutate({ id: editingStaff.id, ...data });
    } else {
      createStaff.mutate(data);
    }
    setEditingStaff(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteStaff.mutate(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader 
        title="Персонал" 
        description={`${staff.filter(s => s.is_active).length} активних співробітників`}
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
              placeholder="Пошук за ім'ям або посадою..."
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
        ) : filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає співробітників</p>
            <Button variant="link" onClick={() => setFormOpen(true)}>
              Додати першого співробітника
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStaff.map((staffMember) => (
              <StaffCard
                key={staffMember.id}
                staff={staffMember}
                onEdit={handleEdit}
                onDelete={setDeletingId}
              />
            ))}
          </div>
        )}
      </div>

      <StaffForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingStaff(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingStaff || undefined}
        isLoading={createStaff.isPending || updateStaff.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити співробітника?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Всі дані про співробітника будуть видалені.
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
