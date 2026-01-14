import { UsersRound, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Group } from '@/hooks/useGroups';

interface GroupCardProps {
  group: Group;
  studentsCount?: number;
  onEdit: (group: Group) => void;
  onDelete: (id: string) => void;
}

export function GroupCard({ group, studentsCount = 0, onEdit, onDelete }: GroupCardProps) {
  return (
    <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${group.color}20` }}
          >
            <UsersRound className="h-6 w-6" style={{ color: group.color }} />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{group.name}</h3>
            {studentsCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {studentsCount} {studentsCount === 1 ? 'дитина' : 'дітей'}
              </p>
            )}
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(group)}>
              <Pencil className="h-4 w-4 mr-2" />
              Редагувати
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(group.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {group.description && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
          {group.description}
        </p>
      )}
    </div>
  );
}
