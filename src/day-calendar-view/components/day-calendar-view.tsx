import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  add,
  format,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isToday,
  parse,
  getDay,
  isWeekend,
} from "date-fns";
import { uk } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Trash2,
  Edit,
  Plus,
  Repeat,
  AlertTriangle,
  Loader2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";

import { useActivities } from "@/hooks/useActivities";
import { useStaff } from "@/hooks/useStaff";
import { useStaffBillingRules } from "@/hooks/useStaffBillingRules";
import { useGroupLessons } from "@/hooks/useGroupLessons";
import {
  useLessonActivities,
  useAddLessonActivity,
  useUpdateLessonActivity,
  useDeleteLessonActivity,
} from "@/hooks/useLessonActivities";
import {
  LessonActivity,
  ActivityInstance,
  NewLessonActivityPayload,
  RecurrenceFreq,
  GroupLesson,
} from "@/day-calendar-view/types";

const getInitialFormData = (selectedDate: Date) => ({
  activityId: "",
  groupLessonId: "",
  title: "",
  teacherId: "",
  teacher: "",
  color: "#3b82f6",
  startTime: "09:00",
  endTime: "10:00",
  startDate: format(selectedDate, "yyyy-MM-dd"),
  recurrence: "none" as RecurrenceFreq | "none",
  untilDate: format(add(selectedDate, { months: 1 }), "yyyy-MM-dd"),
  comment: "",
});

// --- COMPONENT ---
const DayCalendarView = () => {
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] =
    useState<ActivityInstance | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const {
    data: activities = [],
    isLoading: isLoadingLessons,
    isError: isErrorLessons,
  } = useLessonActivities();
  const { mutate: addLesson, isPending: isAddingLesson } =
    useAddLessonActivity();
  const { mutate: updateLesson, isPending: isUpdatingLesson } =
    useUpdateLessonActivity();
  const { mutate: deleteLesson, isPending: isDeletingLesson } =
    useDeleteLessonActivity();

  const { data: availableActivities, isLoading: isLoadingActivities } =
    useActivities();
  const { data: groupLessons = [], isLoading: isLoadingGroupLessons } =
    useGroupLessons();
  const { data: availableStaff, isLoading: isLoadingStaff } = useStaff();
  const { data: staffBillingRules, isLoading: isLoadingBillingRules } =
    useStaffBillingRules();

  const journalActivities = useMemo(() => {
    return (availableActivities || []).filter((act) => act.show_in_journals);
  }, [availableActivities]);

  const groupLessonMap = useMemo(() => {
    const map = new Map<string, GroupLesson>();
    groupLessons.forEach((gl) => map.set(gl.name.trim().toLowerCase(), gl));
    return map;
  }, [groupLessons]);

  const currentDay = format(currentDate, "yyyy-MM-dd");

  const dailyActivities = useMemo(() => {
    const instances: { [key: string]: ActivityInstance[] } = {};
    activities.forEach((lesson) => {
      const groupLesson = groupLessonMap.get(lesson.title.trim().toLowerCase());
      const isGroup = !!groupLesson;
      const commonProps: Partial<ActivityInstance> = {
        isGroupLesson: isGroup,
        groupLessonId: groupLesson?.id,
      };

      const lessonStartDate = parse(lesson.startDate, "yyyy-MM-dd", new Date());

      if (lesson.rrule && lesson.rrule.until) {
        const untilDate = parse(lesson.rrule.until, "yyyy-MM-dd", new Date());
        const intervalDays = eachDayOfInterval({
          start: lessonStartDate,
          end: untilDate,
        });
        const recurringDayOfWeek = getDay(lessonStartDate);

        intervalDays.forEach((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          let shouldInclude = false;

          switch (lesson.rrule?.freq) {
            case "daily":
              shouldInclude = true;
              break;
            case "weekly":
              shouldInclude = getDay(day) === recurringDayOfWeek;
              break;
            case "weekdays":
              shouldInclude = !isWeekend(day);
              break;
          }

          if (shouldInclude && !lesson.excludedDates?.includes(dateStr)) {
            if (!instances[dateStr]) instances[dateStr] = [];
            instances[dateStr].push({
              ...lesson,
              ...commonProps,
              instanceId: `${lesson.id}-${dateStr}`,
              date: dateStr,
              isRecurring: true,
            });
          }
        });
      } else {
        const dateStr = lesson.startDate;
        if (!instances[dateStr]) instances[dateStr] = [];
        instances[dateStr].push({
          ...lesson,
          ...commonProps,
          instanceId: `${lesson.id}-${dateStr}`,
          date: dateStr,
          isRecurring: false,
        });
      }
    });

    for (const date in instances) {
      instances[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return instances;
  }, [activities, groupLessonMap]);

  const activitiesForSelectedDay = useMemo(
    () => dailyActivities[currentDay] || [],
    [dailyActivities, currentDay],
  );

  const handleAddActivityClick = () => {
    setEditingActivity(null);
    setIsModalOpen(true);
  };

  const handleEditActivityClick = (activity: ActivityInstance) => {
    setEditingActivity(activity);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (activity: ActivityInstance) => {
    setEditingActivity(activity);
    setIsDeleteAlertOpen(true);
  };

  const handleSaveActivity = (formData: any) => {
    const payload: Omit<NewLessonActivityPayload, "groupLessonId"> = {
      title: formData.title,
      teacher: formData.teacher,
      color: formData.color,
      startTime: formData.startTime,
      endTime: formData.endTime,
      comment: formData.comment,
      activityId: formData.activityId,
      teacherId: formData.teacherId,
      startDate: formData.startDate,
      rrule:
        formData.recurrence !== "none"
          ? { freq: formData.recurrence, until: formData.untilDate }
          : undefined,
      excludedDates: [],
    };

    if (editingActivity) {
      updateLesson(
        { ...payload, id: editingActivity.id },
        {
          onSuccess: () => {
            toast({ title: "Успіх!", description: "Запис оновлено." });
            setIsModalOpen(false);
            setEditingActivity(null);
          },
          onError: (error) =>
            toast({
              title: "Помилка!",
              description: `Не вдалося оновити запис: ${error.message}`,
              variant: "destructive",
            }),
        },
      );
    } else {
      addLesson(payload as NewLessonActivityPayload, {
        onSuccess: () => {
          toast({ title: "Успіх!", description: "Новий запис додано." });
          setIsModalOpen(false);
        },
        onError: (error) =>
          toast({
            title: "Помилка!",
            description: `Не вдалося додати запис: ${error.message}`,
            variant: "destructive",
          }),
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (!editingActivity) return;
    deleteLesson(editingActivity.id, {
      onSuccess: () => {
        toast({ title: "Успіх!", description: "Запис видалено." });
        setIsDeleteAlertOpen(false);
        setEditingActivity(null);
      },
      onError: (error) =>
        toast({
          title: "Помилка!",
          description: `Не вдалося видалити запис: ${error.message}`,
          variant: "destructive",
        }),
    });
  };

  return (
    <div className="p-2 md:p-4 bg-card rounded-lg shadow">
      <CalendarHeader
        currentDate={currentDate}
        onPreviousDay={() => setCurrentDate(add(currentDate, { days: -1 }))}
        onNextDay={() => setCurrentDate(add(currentDate, { days: 1 }))}
        onDateChange={(d) => d && setCurrentDate(d)}
        onGoToToday={() => setCurrentDate(new Date())}
      />
      <div className="w-full mt-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">
            {format(currentDate, "EEEE, d MMMM", { locale: uk })}
          </h2>
          <Button size="sm" onClick={handleAddActivityClick}>
            <Plus className="h-4 w-4 mr-2" />
            Додати запис
          </Button>
        </div>
        <div className="space-y-3 mt-4 pr-2 max-h-[60vh] overflow-y-auto">
          {isLoadingLessons || isLoadingGroupLessons ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4 text-muted-foreground">Завантаження...</p>
            </div>
          ) : isErrorLessons ? (
            <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-4 rounded-md">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <p className="font-semibold">Помилка завантаження</p>
            </div>
          ) : activitiesForSelectedDay.length > 0 ? (
            activitiesForSelectedDay.map((activity) => (
              <ActivityCard
                key={activity.instanceId}
                activity={activity}
                onEdit={handleEditActivityClick}
                onDelete={handleDeleteClick}
              />
            ))
          ) : (
            <p className="text-muted-foreground text-center py-8">
              На цей день записів немає.
            </p>
          )}
        </div>
      </div>
      {isModalOpen && (
        <ActivityModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingActivity(null);
          }}
          onSave={handleSaveActivity}
          activity={editingActivity}
          selectedDate={currentDate}
          journalActivities={journalActivities}
          groupLessons={groupLessons || []}
          availableStaff={availableStaff || []}
          staffBillingRules={staffBillingRules || []}
          isLoading={
            isLoadingActivities ||
            isLoadingStaff ||
            isLoadingBillingRules ||
            isLoadingGroupLessons
          }
          isSaving={isAddingLesson || isUpdatingLesson}
        />
      )}
      {editingActivity && (
        <DeleteConfirmationDialog
          isOpen={isDeleteAlertOpen}
          onClose={() => {
            setIsDeleteAlertOpen(false);
            setEditingActivity(null);
          }}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeletingLesson}
        />
      )}
    </div>
  );
};

const CalendarHeader = ({
  currentDate,
  onPreviousDay,
  onNextDay,
  onDateChange,
  onGoToToday,
}: any) => (
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
    <div className="flex items-center gap-2">
      <h1 className="text-xl font-bold">Календар</h1>
      <Button
        variant="outline"
        size="sm"
        onClick={onGoToToday}
        disabled={isToday(currentDate)}
      >
        Сьогодні
      </Button>
    </div>
    <div className="flex items-center justify-center gap-1 md:gap-2">
      <Button variant="outline" size="icon" onClick={onPreviousDay}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-[200px] justify-start text-left font-normal",
              !currentDate && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {currentDate ? (
              format(currentDate, "PPP", { locale: uk })
            ) : (
              <span>Оберіть дату</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={onDateChange}
            initialFocus
            locale={uk}
          />
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" onClick={onNextDay}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const formatTime = (time?: string) => {
  if (!time) return "";
  return time.length >= 5 ? time.slice(0, 5) : time;
};

const ActivityCard = ({
  activity,
  onEdit,
  onDelete,
}: {
  activity: ActivityInstance;
  onEdit: (act: ActivityInstance) => void;
  onDelete: (act: ActivityInstance) => void;
}) => {
  const journalLink = useMemo(() => {
    const dateParam = `date=${activity.date}`;
    if (activity.isGroupLesson && activity.groupLessonId) {
      return `/group-lessons?groupLessonId=${activity.groupLessonId}&${dateParam}`;
    } else if (activity.activityId) {
      return `/attendance?activityId=${activity.activityId}&${dateParam}`;
    }
    return "#"; // Fallback link
  }, [activity]);

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border"
      style={{ borderLeftColor: activity.color, borderLeftWidth: 4 }}
    >
      <div className="flex-1 flex flex-col">
        {activity.isGroupLesson && (
          <Badge
            variant="secondary"
            className="flex items-center gap-1 w-fit mb-1.5"
          >
            <Users className="h-3 w-3" />
            Групове
          </Badge>
        )}
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-base">
            <Link
              to={journalLink}
              className="hover:underline hover:text-blue-600 transition-colors"
            >
              {activity.title}
            </Link>
          </h3>
          {activity.isRecurring && (
            <Repeat
              className="h-4 w-4 text-muted-foreground"
              title="Повторювана подія"
            />
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-1">{activity.teacher}</p>
        <p className="text-sm font-mono mt-1">{`${formatTime(activity.startTime)} - ${formatTime(activity.endTime)}`}</p>
        {activity.comment && (
          <p className="text-sm mt-2 p-2 bg-muted/50 rounded-md whitespace-pre-wrap">
            {activity.comment}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(activity)}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => onDelete(activity)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const ActivityModal = ({
  isOpen,
  onClose,
  onSave,
  activity,
  selectedDate,
  journalActivities,
  groupLessons,
  availableStaff,
  staffBillingRules,
  isLoading,
  isSaving,
}: any) => {
  const [activityType, setActivityType] = useState("additional");
  const [formData, setFormData] = useState(() =>
    getInitialFormData(selectedDate),
  );

  useEffect(() => {
    if (!isOpen) return;
    const initialDate = activity
      ? parse(activity.startDate, "yyyy-MM-dd", new Date())
      : selectedDate;
    let determinedType = "additional";
    let matchingGroupLesson: GroupLesson | undefined;

    if (activity) {
      const groupLessonMap = new Map<string, GroupLesson>();
      groupLessons.forEach((gl: GroupLesson) =>
        groupLessonMap.set(gl.name.trim().toLowerCase(), gl),
      );
      matchingGroupLesson = groupLessonMap.get(
        activity.title.trim().toLowerCase(),
      );
      if (matchingGroupLesson) {
        determinedType = "group";
      }
    }

    setActivityType(determinedType);

    if (activity) {
      setFormData({
        activityId: matchingGroupLesson
          ? matchingGroupLesson.activity_id
          : activity.activityId,
        groupLessonId: matchingGroupLesson ? matchingGroupLesson.id : "",
        title: activity.title,
        teacherId: activity.teacherId,
        teacher: activity.teacher,
        color: activity.color,
        startTime: activity.startTime,
        endTime: activity.endTime,
        startDate: activity.startDate,
        recurrence: activity.rrule?.freq || "none",
        untilDate:
          activity.rrule?.until ||
          format(add(initialDate, { months: 1 }), "yyyy-MM-dd"),
        comment: activity.comment || "",
      });
    } else {
      setFormData(getInitialFormData(selectedDate));
    }
  }, [activity, selectedDate, isOpen, groupLessons]);

  const handleTypeChange = (newType: string) => {
    setActivityType(newType);
    // Keep comment and date when switching type
    setFormData((prev) => ({
      ...getInitialFormData(parse(prev.startDate, "yyyy-MM-dd", new Date())),
      comment: prev.comment,
    }));
  };

  const handleActivityChange = (id: string) => {
    if (activityType === "additional") {
      const selectedActivity = journalActivities.find((a: any) => a.id === id);
      if (!selectedActivity) return;
      const rule = staffBillingRules.find((r: any) => r.activity_id === id);
      const teacher = rule
        ? availableStaff.find((s: any) => s.id === rule.staff_id)
        : null;
      setFormData((prev) => ({
        ...prev,
        activityId: selectedActivity.id,
        groupLessonId: "",
        title: selectedActivity.name,
        color: selectedActivity.color,
        teacherId: teacher?.id || "",
        teacher: teacher?.full_name || "",
      }));
    } else {
      const selectedLesson = groupLessons.find((l: any) => l.id === id);
      if (!selectedLesson) return;
      const teacher = selectedLesson.staff?.[0] || null;
      setFormData((prev) => ({
        ...prev,
        activityId: selectedLesson.activity_id,
        groupLessonId: selectedLesson.id,
        title: selectedLesson.name,
        color: selectedLesson.activities?.color || "#3B82F6",
        teacherId: teacher?.id || "",
        teacher: teacher?.full_name || "",
      }));
    }
  };

  const handleDateChange = (date: Date | undefined) =>
    date &&
    setFormData((prev) => ({ ...prev, startDate: format(date, "yyyy-MM-dd") }));
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setFormData({ ...formData, [e.target.name]: e.target.value });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {activity ? "Редагувати запис" : "Додати новий запис"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <RadioGroup
            defaultValue="additional"
            value={activityType}
            onValueChange={handleTypeChange}
            className="flex gap-4"
            disabled={!!activity}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="additional" id="r1" />
              <Label htmlFor="r1">Додаткові</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="group" id="r2" />
              <Label htmlFor="r2">Групові</Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label>Назва заняття</Label>
            {activityType === "additional" ? (
              <Select
                onValueChange={handleActivityChange}
                value={formData.activityId}
                disabled={isLoading || !!activity}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <SelectItem value="loading" disabled>
                      Завантаження...
                    </SelectItem>
                  ) : (
                    journalActivities.map((act: any) => (
                      <SelectItem key={act.id} value={act.id}>
                        {act.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Select
                onValueChange={handleActivityChange}
                value={formData.groupLessonId}
                disabled={isLoading || !!activity}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <SelectItem value="loading" disabled>
                      Завантаження...
                    </SelectItem>
                  ) : (
                    groupLessons.map((lesson: any) => (
                      <SelectItem key={lesson.id} value={lesson.id}>
                        {lesson.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Дата</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.startDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.startDate ? (
                    format(
                      parse(formData.startDate, "yyyy-MM-dd", new Date()),
                      "PPP",
                      { locale: uk },
                    )
                  ) : (
                    <span>Оберіть дату</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parse(formData.startDate, "yyyy-MM-dd", new Date())}
                  onSelect={handleDateChange}
                  initialFocus
                  locale={uk}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Викладач</Label>
            <Input value={formData.teacher} disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Час початку</Label>
              <Input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Час закінчення</Label>
              <Input
                type="time"
                name="endTime"
                value={formData.endTime}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Колір</Label>
            <Input
              type="color"
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="p-1 h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment">Коментар</Label>
            <Textarea
              id="comment"
              name="comment"
              placeholder="Додайте коментар..."
              value={formData.comment}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label>Повторення</Label>
            <Select
              onValueChange={(value) =>
                setFormData({ ...formData, recurrence: value })
              }
              value={formData.recurrence}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не повторювати</SelectItem>
                <SelectItem value="daily">Кожен день</SelectItem>
                <SelectItem value="weekdays">Кожен день (будні)</SelectItem>
                <SelectItem value="weekly">Щотижня (в цей день)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formData.recurrence !== "none" && (
            <div className="space-y-2 pl-4 border-l-2 ml-2">
              <Label>Повторювати до</Label>
              <Input
                type="date"
                name="untilDate"
                value={formData.untilDate}
                onChange={handleChange}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Скасувати
          </Button>
          <Button onClick={() => onSave(formData)} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{" "}
            {activity ? "Зберегти" : "Створити"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: any) => (
  <AlertDialog open={isOpen} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Ви впевнені?</AlertDialogTitle>
        <AlertDialogDescription>
          Цю дію неможливо буде скасувати. Це призведе до повного видалення
          всієї серії, якщо подія повторюється.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Скасувати</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isDeleting}>
          {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Видалити
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default DayCalendarView;
