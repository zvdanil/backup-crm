import { BookOpen, MoreVertical, Pencil, Trash2, Users, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/attendance';
import { getActivityDisplayPrice } from '@/lib/activityPrice';
import { useActivityPriceHistory } from '@/hooks/useActivities';
import type { Activity } from '@/hooks/useActivities';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

interface ActivityCardProps {
  activity: Activity;
  enrolledCount?: number;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
}

export function ActivityCard({ activity, enrolledCount = 0, onEdit, onDelete }: ActivityCardProps) {
  const { data: priceHistory } = useActivityPriceHistory(activity.id);
  const currentDate = new Date().toISOString().split('T')[0];
  
  const displayPrice = useMemo(() => {
    return getActivityDisplayPrice(
      activity,
      priceHistory,
      null, // No custom_price in activity card
      0, // No discount in activity card
      currentDate
    );
  }, [activity, priceHistory, currentDate]);
  
  return (
    <div className="group rounded-xl bg-card border border-border p-5 shadow-soft hover:shadow-card transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${activity.color}20` }}
          >
            <BookOpen className="h-6 w-6" style={{ color: activity.color }} />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{activity.name}</h3>
            <p className="text-sm text-muted-foreground">
              {displayPrice || 'Ціна не встановлена'}
            </p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(activity.category === 'expense' || activity.category === 'household_expense' || activity.category === 'salary') && (
              <DropdownMenuItem asChild>
                <Link to={`/activities/${activity.id}/expenses`}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Журнал витрат
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onEdit(activity)}>
              <Pencil className="h-4 w-4 mr-2" />
              Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(activity.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activity.description && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
          {activity.description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-4 w-4" />
          {enrolledCount} записей
        </span>
        {activity.billing_rules && typeof activity.billing_rules === 'object' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            Налаштовані правила розрахунку
          </span>
        )}
      </div>
    </div>
  );
}
