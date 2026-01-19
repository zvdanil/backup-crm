import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/context/AuthContext';
import { useParentStudents } from '@/hooks/useParentPortal';
import { Users } from 'lucide-react';

export default function ParentPortal() {
  const { profile } = useAuth();
  const { data: students = [], isLoading } = useParentStudents(profile?.id);

  return (
    <>
      <PageHeader title="Кабінет батьків" description="Ваші діти" />
      <div className="p-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Users className="h-10 w-10 mb-4 opacity-50" />
            <p>Діти не привʼязані</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => (
              <Link
                key={student.id}
                to={`/parent/students/${student.id}`}
                className="rounded-xl border border-border bg-card p-4 shadow-soft hover:shadow-card transition-shadow"
              >
                <div className="text-sm font-semibold">{student.full_name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {student.groups?.name || 'Без групи'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
