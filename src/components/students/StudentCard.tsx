import { User, Phone, Mail, Calendar, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Student } from '@/hooks/useStudents';
import { Link } from 'react-router-dom';

interface StudentCardProps {
  student: Student;
  onEdit: (student: Student) => void;
  onDelete: (id: string) => void;
}

export function StudentCard({ student, onEdit, onDelete }: StudentCardProps) {
  const birthDate = student.birth_date 
    ? new Date(student.birth_date).toLocaleDateString('uk-UA')
    : null;

  return (
    <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <Link to={`/students/${student.id}`} className="flex items-center gap-3 hover:opacity-80">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{student.full_name}</h3>
            {birthDate && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {birthDate}
              </p>
            )}
          </div>
        </Link>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(student)}>
              <Pencil className="h-4 w-4 mr-2" />
              Редагувати
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(student.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(student.guardian_phone || student.guardian_email) && (
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          {student.guardian_name && (
            <p className="font-medium text-foreground/80">{student.guardian_name}</p>
          )}
          {student.guardian_phone && (
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              {student.guardian_phone}
            </p>
          )}
          {student.guardian_email && (
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              {student.guardian_email}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
