import { User, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import type { Staff } from '@/hooks/useStaff';

interface StaffCardProps {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (id: string) => void;
}

export function StaffCard({ staff, onEdit, onDelete }: StaffCardProps) {
  return (
    <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{staff.full_name}</h3>
            <p className="text-sm text-muted-foreground">{staff.position}</p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/staff/${staff.id}`}>
                <Pencil className="h-4 w-4 mr-2" />
                Деталі
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(staff)}>
              <Pencil className="h-4 w-4 mr-2" />
              Редагувати
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(staff.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!staff.is_active && (
        <div className="mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">Неактивний</span>
        </div>
      )}
    </div>
  );
}
