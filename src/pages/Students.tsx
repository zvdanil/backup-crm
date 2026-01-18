import { useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { StudentCard } from '@/components/students/StudentCard';
import { StudentForm } from '@/components/students/StudentForm';
import { useStudents, useCreateStudent, useUpdateStudent, useDeleteStudent, type Student } from '@/hooks/useStudents';
import { useActivities } from '@/hooks/useActivities';
import { useCreateEnrollment, useEnrollments, useUnenrollStudent } from '@/hooks/useEnrollments';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function Students() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const scrollTopRef = useRef(0);

  const { data: students = [], isLoading } = useStudents();
  const { data: activities = [] } = useActivities();
  const { data: enrollments = [] } = useEnrollments({ activeOnly: true });
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const deleteStudent = useDeleteStudent();
  const createEnrollment = useCreateEnrollment();
  const unenrollStudent = useUnenrollStudent();

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.guardian_name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeActivities = useMemo(
    () => activities.filter(activity => activity.is_active && activity.show_in_children),
    [activities]
  );
  const tableGridTemplate = useMemo(
    () => `220px repeat(${activeActivities.length}, 140px)`,
    [activeActivities.length]
  );
  const tableMinWidth = useMemo(
    () => `${220 + activeActivities.length * 140}px`,
    [activeActivities.length]
  );

  const enrollmentMap = useMemo(() => {
    const map = new Map<string, (typeof enrollments)[number]>();
    enrollments.forEach((enrollment) => {
      map.set(`${enrollment.student_id}:${enrollment.activity_id}`, enrollment);
    });
    return map;
  }, [enrollments]);

  const handleToggleEnrollment = (studentId: string, activityId: string, checked: boolean) => {
    const existing = enrollmentMap.get(`${studentId}:${activityId}`);
    if (checked) {
      if (!existing) {
        createEnrollment.mutate({
          student_id: studentId,
          activity_id: activityId,
          custom_price: null,
          discount_percent: null,
        });
      }
    } else if (existing) {
      unenrollStudent.mutate(existing.id);
    }
  };

  const handleTableMouseMove = (event: MouseEvent) => {
    if (!isDraggingRef.current || !tableScrollRef.current) return;
    event.preventDefault();
    const rect = tableScrollRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const walk = x - dragStartXRef.current;
    const walkY = y - dragStartYRef.current;
    tableScrollRef.current.scrollLeft = scrollLeftRef.current - walk;
    tableScrollRef.current.scrollTop = scrollTopRef.current - walkY;
  };

  const handleTableMouseUp = () => {
    isDraggingRef.current = false;
    tableScrollRef.current?.classList.remove('is-dragging');
    window.removeEventListener('mousemove', handleTableMouseMove);
    window.removeEventListener('mouseup', handleTableMouseUp);
  };

  const handleTableMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tableScrollRef.current || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, label, [role="checkbox"]')) {
      return;
    }
    isDraggingRef.current = true;
    const rect = tableScrollRef.current.getBoundingClientRect();
    dragStartXRef.current = event.clientX - rect.left;
    dragStartYRef.current = event.clientY - rect.top;
    scrollLeftRef.current = tableScrollRef.current.scrollLeft;
    scrollTopRef.current = tableScrollRef.current.scrollTop;
    tableScrollRef.current.classList.add('is-dragging');
    window.addEventListener('mousemove', handleTableMouseMove);
    window.addEventListener('mouseup', handleTableMouseUp);
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setFormOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (editingStudent) {
      updateStudent.mutate({ id: editingStudent.id, ...data });
    } else {
      createStudent.mutate(data);
    }
    setEditingStudent(null);
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteStudent.mutate(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader 
        title="Діти" 
        description={`${students.length} записів`}
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
              placeholder="Пошук за ім'ям..."
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
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає дітей</p>
            <Button variant="link" onClick={() => setFormOpen(true)}>
              Додати першу дитину
            </Button>
          </div>
        ) : (
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'cards' | 'table')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {filteredStudents.length} дітей, {activeActivities.length} активностей
              </div>
              <TabsList>
                <TabsTrigger value="cards">Карточки</TabsTrigger>
                <TabsTrigger value="table">Таблиця</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="cards" className="mt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredStudents.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    onEdit={handleEdit}
                    onDelete={setDeletingId}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="table" className="mt-6">
              {activeActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <p>Немає активних активностей</p>
                </div>
              ) : (
                <div
                  ref={tableScrollRef}
                  onMouseDown={handleTableMouseDown}
                  className={cn(
                    "rounded-xl border border-border bg-card shadow-soft overflow-auto max-h-[70vh] relative",
                    "cursor-grab active:cursor-grabbing select-none",
                    "[&.is-dragging]:cursor-grabbing"
                  )}
                >
                  <div
                    className="grid w-max"
                    style={{
                      gridTemplateColumns: tableGridTemplate,
                      minWidth: tableMinWidth,
                    }}
                  >
                    <div className="sticky top-0 z-30 bg-card col-span-full">
                      <div
                        className="grid bg-muted/30 border-b"
                        style={{
                          gridTemplateColumns: tableGridTemplate,
                        }}
                      >
                        <div className="px-4 py-2 font-medium sticky left-0 bg-muted/30 z-40">
                          Дитина
                        </div>
                        {activeActivities.map((activity) => (
                          <div key={activity.id} className="px-2 py-2 text-center font-medium">
                            <div className="flex items-center justify-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: activity.color }}
                              />
                              <span
                                className="whitespace-normal break-words leading-snug"
                                title={activity.name}
                              >
                                {activity.name}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {filteredStudents.map((student) => (
                      <div key={student.id} className="contents">
                        <div className="px-4 py-3 border-b bg-card sticky left-0 z-20">
                          <Link
                            to={`/students/${student.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {student.full_name}
                          </Link>
                          {student.guardian_name && (
                            <div className="text-xs text-muted-foreground truncate">
                              {student.guardian_name}
                            </div>
                          )}
                        </div>
                        {activeActivities.map((activity) => {
                          const enrollment = enrollmentMap.get(`${student.id}:${activity.id}`);
                          const isBusy = createEnrollment.isPending || unenrollStudent.isPending;
                          return (
                            <div
                              key={`${student.id}-${activity.id}`}
                              className="px-2 py-3 border-b text-center"
                            >
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={!!enrollment}
                                  onCheckedChange={(checked) => {
                                    const nextChecked = checked === true;
                                    handleToggleEnrollment(student.id, activity.id, nextChecked);
                                  }}
                                  disabled={isBusy}
                                  className={cn(!enrollment && "opacity-60")}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <StudentForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingStudent(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingStudent || undefined}
        isLoading={createStudent.isPending || updateStudent.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити дитину?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію не можна скасувати. Всі дані про відвідуваність та записи будуть видалені.
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
