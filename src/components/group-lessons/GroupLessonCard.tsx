import { BookOpen, MoreVertical, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GroupLesson } from '@/hooks/useGroupLessons';

interface GroupLessonCardProps {
  lesson: GroupLesson;
  onEdit: (lesson: GroupLesson) => void;
  onDelete: (id: string) => void;
}

export function GroupLessonCard({ lesson, onEdit, onDelete }: GroupLessonCardProps) {
  const activityName = lesson.activities?.name || 'Без активності';
  const staffNames = (lesson.staff || []).map((member) => member.full_name).join(', ');

  return (
    <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{lesson.name}</h3>
            <p className="text-sm text-muted-foreground">{activityName}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(lesson)}>
              <Pencil className="h-4 w-4 mr-2" />
              Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(lesson.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-4 w-4" />
          {lesson.staff?.length ? `${lesson.staff.length} викладачів` : 'Без викладачів'}
        </span>
      </div>

      {staffNames && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
          {staffNames}
        </p>
      )}
    </div>
  );
}
