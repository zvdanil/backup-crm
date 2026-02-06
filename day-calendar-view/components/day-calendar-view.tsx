"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, X, Trash2, Pencil, RefreshCw } from 'lucide-react';
import { format, addDays, addWeeks, addMonths, startOfDay, setHours, setMinutes, differenceInMinutes, isSameDay, addMinutes, isAfter, isBefore, differenceInDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { uk } from 'date-fns/locale';

// --- Типи даних ---
type RecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface LessonActivity {
  id: string;
  title: string;
  instructorName: string;
  // Час зберігаємо як години:хвилини (відносно дня)
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  color: string;
  // Дата початку серії (або одиничного запису)
  baseDate: Date;
  // Правило повторення
  recurrence: RecurrenceType;
  // Дата закінчення повторення (null = безкінечно)
  recurrenceEndDate: Date | null;
  // Виключення - дати, коли запис пропущено
  exceptions: string[]; // ISO date strings
}

// Віртуальний екземпляр для відображення
interface ActivityInstance {
  activity: LessonActivity;
  date: Date;
  startTime: Date;
  endTime: Date;
}

// Доступні кольори для занять
const ACTIVITY_COLORS = [
  { name: 'Синій', value: 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200' },
  { name: 'Зелений', value: 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200' },
  { name: 'Фіолетовий', value: 'bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200' },
  { name: 'Жовтий', value: 'bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200' },
  { name: 'Червоний', value: 'bg-red-100 border-red-300 text-red-800 hover:bg-red-200' },
  { name: 'Рожевий', value: 'bg-pink-100 border-pink-300 text-pink-800 hover:bg-pink-200' },
];

// Варіанти тривалості
const DURATION_OPTIONS = [
  { label: '30 хв', value: 30 },
  { label: '45 хв', value: 45 },
  { label: '1 год', value: 60 },
  { label: '1.5 год', value: 90 },
  { label: '2 год', value: 120 },
  { label: '2.5 год', value: 150 },
  { label: '3 год', value: 180 },
];

// Варіанти періодичності
const RECURRENCE_OPTIONS: { label: string; value: RecurrenceType }[] = [
  { label: 'Без повторення', value: 'none' },
  { label: 'Щодня', value: 'daily' },
  { label: 'Щотижня', value: 'weekly' },
  { label: 'Кожні 2 тижні', value: 'biweekly' },
  { label: 'Щомісяця', value: 'monthly' },
];

// --- Конфігурація календаря ---
const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_HEIGHT_PX = 80;

// --- Тестові дані ---
const today = startOfDay(new Date());
const mockActivities: LessonActivity[] = [
  {
    id: '1',
    title: 'Робототехніка (Група А)',
    instructorName: 'Олександр Іваненко',
    startHour: 9,
    startMinute: 0,
    durationMinutes: 90,
    color: 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200',
    baseDate: today,
    recurrence: 'weekly',
    recurrenceEndDate: null,
    exceptions: [],
  },
  {
    id: '2',
    title: 'Англійська мова (Індивідуальне)',
    instructorName: 'Марія Коваль',
    startHour: 11,
    startMinute: 0,
    durationMinutes: 45,
    color: 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200',
    baseDate: today,
    recurrence: 'none',
    recurrenceEndDate: null,
    exceptions: [],
  },
  {
    id: '3',
    title: 'Підготовка до школи',
    instructorName: 'Світлана Петрівна',
    startHour: 14,
    startMinute: 15,
    durationMinutes: 90,
    color: 'bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200',
    baseDate: today,
    recurrence: 'biweekly',
    recurrenceEndDate: null,
    exceptions: [],
  },
  {
    id: '4',
    title: 'Малювання',
    instructorName: 'Арт-студія',
    startHour: 15,
    startMinute: 0,
    durationMinutes: 60,
    color: 'bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200',
    baseDate: today,
    recurrence: 'daily',
    recurrenceEndDate: null,
    exceptions: [],
  }
];

// --- Допоміжні функції ---
const hours_ticks = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const calculateTopOffset = (date: Date): number => {
  const startOfCalendarDay = setHours(startOfDay(date), START_HOUR);
  const minutesFromStart = differenceInMinutes(date, startOfCalendarDay);
  return (minutesFromStart / 60) * HOUR_HEIGHT_PX;
};

const calculateHeight = (durationMinutes: number): number => {
  return (durationMinutes / 60) * HOUR_HEIGHT_PX;
};

const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === END_HOUR && minute > 0) break;
      const h = hour.toString().padStart(2, '0');
      const m = minute.toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Перевіряє, чи запис повинен відображатися на певну дату
const isActivityOnDate = (activity: LessonActivity, date: Date): boolean => {
  const targetDate = startOfDay(date);
  const baseDate = startOfDay(activity.baseDate);
  
  // Перевірка на дату закінчення
  if (activity.recurrenceEndDate && isAfter(targetDate, startOfDay(activity.recurrenceEndDate))) {
    return false;
  }
  
  // Перевірка на виключення
  const dateStr = format(targetDate, 'yyyy-MM-dd');
  if (activity.exceptions.includes(dateStr)) {
    return false;
  }
  
  // Якщо дата до початку - не показуємо
  if (isBefore(targetDate, baseDate)) {
    return false;
  }
  
  // Для одиничних записів
  if (activity.recurrence === 'none') {
    return isSameDay(targetDate, baseDate);
  }
  
  // Для повторюваних записів
  switch (activity.recurrence) {
    case 'daily':
      return true; // Кожен день після baseDate
    case 'weekly': {
      const daysDiff = differenceInDays(targetDate, baseDate);
      return daysDiff % 7 === 0;
    }
    case 'biweekly': {
      const daysDiff = differenceInDays(targetDate, baseDate);
      return daysDiff % 14 === 0;
    }
    case 'monthly': {
      // Той самий день місяця
      return targetDate.getDate() === baseDate.getDate();
    }
    default:
      return false;
  }
};

// Створює екземпляр запису для конкретної дати
const createActivityInstance = (activity: LessonActivity, date: Date): ActivityInstance => {
  const dayStart = startOfDay(date);
  const startTime = setMinutes(setHours(dayStart, activity.startHour), activity.startMinute);
  const endTime = addMinutes(startTime, activity.durationMinutes);
  
  return {
    activity,
    date: dayStart,
    startTime,
    endTime,
  };
};

// === Головний Компонент Календаря ===
const DayCalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState<LessonActivity[]>(mockActivities);
  
  // Датапікер
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(new Date());
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Закриття датапікера при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };

    if (isDatePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDatePickerOpen]);
  
  // Модальне вікно додавання
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newInstructor, setNewInstructor] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newDuration, setNewDuration] = useState(60);
  const [newColor, setNewColor] = useState(ACTIVITY_COLORS[0].value);
  const [newRecurrence, setNewRecurrence] = useState<RecurrenceType>('none');

  // Модальне вікно редагування/видалення
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ActivityInstance | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editInstructor, setEditInstructor] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editDuration, setEditDuration] = useState(60);
  const [editColor, setEditColor] = useState(ACTIVITY_COLORS[0].value);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceType>('none');
  const [deleteMode, setDeleteMode] = useState<'single' | 'future' | 'all'>('single');

  // Отримуємо всі екземпляри занять для поточного дня
  const todaysInstances = useMemo(() => {
    const instances: ActivityInstance[] = [];
    for (const activity of activities) {
      if (isActivityOnDate(activity, currentDate)) {
        instances.push(createActivityInstance(activity, currentDate));
      }
    }
    return instances;
  }, [currentDate, activities]);

  // Навігація по датах
  const prevDay = () => setCurrentDate(addDays(currentDate, -1));
  const nextDay = () => setCurrentDate(addDays(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Вибрати дату з датапікера
  const selectDate = (date: Date) => {
    setCurrentDate(date);
    setIsDatePickerOpen(false);
  };

  // Отримати дні для календарика
  const getCalendarDays = (month: Date) => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  // Відкрити модальне вікно додавання
  const openAddModal = () => {
    setNewTitle('');
    setNewInstructor('');
    setNewStartTime('09:00');
    setNewDuration(60);
    setNewColor(ACTIVITY_COLORS[0].value);
    setNewRecurrence('none');
    setIsAddModalOpen(true);
  };

  // Відкрити модальне вікно редагування
  const openEditModal = (instance: ActivityInstance) => {
    setEditingInstance(instance);
    const activity = instance.activity;
    setEditTitle(activity.title);
    setEditInstructor(activity.instructorName);
    setEditStartTime(`${activity.startHour.toString().padStart(2, '0')}:${activity.startMinute.toString().padStart(2, '0')}`);
    setEditDuration(activity.durationMinutes);
    setEditColor(activity.color);
    setEditRecurrence(activity.recurrence);
    setDeleteMode('single');
    setIsEditModalOpen(true);
  };

  // Додати новий запис
  const handleAddActivity = () => {
    if (!newTitle.trim()) return;

    const [hours, minutes] = newStartTime.split(':').map(Number);
    
    const newActivity: LessonActivity = {
      id: `activity-${Date.now()}`,
      title: newTitle.trim(),
      instructorName: newInstructor.trim() || 'Не вказано',
      startHour: hours,
      startMinute: minutes,
      durationMinutes: newDuration,
      color: newColor,
      baseDate: startOfDay(currentDate),
      recurrence: newRecurrence,
      recurrenceEndDate: null,
      exceptions: [],
    };

    setActivities(prev => [...prev, newActivity]);
    setIsAddModalOpen(false);
  };

  // Зберегти зміни в записі
  const handleSaveActivity = () => {
    if (!editingInstance || !editTitle.trim()) return;

    const [hours, minutes] = editStartTime.split(':').map(Number);
    const activity = editingInstance.activity;

    setActivities(prev => prev.map(a => 
      a.id === activity.id 
        ? {
            ...a,
            title: editTitle.trim(),
            instructorName: editInstructor.trim() || 'Не вказано',
            startHour: hours,
            startMinute: minutes,
            durationMinutes: editDuration,
            color: editColor,
            recurrence: editRecurrence,
          }
        : a
    ));
    setIsEditModalOpen(false);
    setEditingInstance(null);
  };

  // Видалити запис(и)
  const handleDeleteActivity = () => {
    if (!editingInstance) return;

    const activity = editingInstance.activity;
    const instanceDate = format(editingInstance.date, 'yyyy-MM-dd');

    if (deleteMode === 'single') {
      if (activity.recurrence === 'none') {
        // Повніст�� видаляємо одиничний запис
        setActivities(prev => prev.filter(a => a.id !== activity.id));
      } else {
        // Додаємо цю дату до виключень
        setActivities(prev => prev.map(a => 
          a.id === activity.id 
            ? { ...a, exceptions: [...a.exceptions, instanceDate] }
            : a
        ));
      }
    } else if (deleteMode === 'future') {
      // Встановлюємо дату закінчення на день до поточного екземпляру
      const endDate = addDays(editingInstance.date, -1);
      setActivities(prev => prev.map(a => 
        a.id === activity.id 
          ? { ...a, recurrenceEndDate: endDate }
          : a
      ));
    } else if (deleteMode === 'all') {
      // Повністю видаляємо запис
      setActivities(prev => prev.filter(a => a.id !== activity.id));
    }

    setIsEditModalOpen(false);
    setEditingInstance(null);
  };

  const getRecurrenceLabel = (recurrence: RecurrenceType) => {
    return RECURRENCE_OPTIONS.find(o => o.value === recurrence)?.label || '';
  };

  return (
    <div className="flex flex-col h-[800px] max-w-4xl mx-auto border rounded-lg shadow-sm bg-white overflow-hidden font-sans">
      
      {/* --- Верхня панель навігації --- */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50">
        <div className="flex items-center gap-4">
          <div className="relative" ref={datePickerRef}>
            <h2 className="text-xl font-semibold text-gray-800 capitalize flex items-center gap-2">
              <button
                onClick={() => {
                  setDatePickerMonth(currentDate);
                  setIsDatePickerOpen(!isDatePickerOpen);
                }}
                className="p-1 rounded hover:bg-gray-200 transition"
                title="Вибрати дату"
              >
                <CalendarIcon className="h-5 w-5 text-gray-500"/>
              </button>
              {format(currentDate, 'EEEE, d MMMM yyyy', { locale: uk })}
            </h2>
            
            {/* --- Датапікер --- */}
            {isDatePickerOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border rounded-xl shadow-xl z-50 p-4 w-72">
                {/* Заголовок місяця */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setDatePickerMonth(addMonths(datePickerMonth, -1))}
                    className="p-1 rounded hover:bg-gray-100 transition"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="font-semibold text-gray-800 capitalize">
                    {format(datePickerMonth, 'LLLL yyyy', { locale: uk })}
                  </span>
                  <button
                    onClick={() => setDatePickerMonth(addMonths(datePickerMonth, 1))}
                    className="p-1 rounded hover:bg-gray-100 transition"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                
                {/* Дні тижня */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(day => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Дні місяця */}
                <div className="grid grid-cols-7 gap-1">
                  {getCalendarDays(datePickerMonth).map((day, idx) => {
                    const isCurrentMonth = day.getMonth() === datePickerMonth.getMonth();
                    const isSelected = isSameDay(day, currentDate);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => selectDate(day)}
                        className={`
                          p-2 text-sm rounded-lg transition
                          ${isCurrentMonth ? 'text-gray-800' : 'text-gray-400'}
                          ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-100'}
                          ${isToday && !isSelected ? 'border border-blue-500' : ''}
                        `}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
                
                {/* Кнопка "Сьогодні" */}
                <button
                  onClick={() => {
                    setCurrentDate(new Date());
                    setDatePickerMonth(new Date());
                    setIsDatePickerOpen(false);
                  }}
                  className="w-full mt-3 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition font-medium"
                >
                  Сьогодні
                </button>
              </div>
            )}
          </div>
          {!isSameDay(currentDate, new Date()) && (
            <button 
              onClick={goToToday}
              className="text-sm px-3 py-1 rounded-md border bg-white hover:bg-gray-100 transition text-gray-600"
            >
              Сьогодні
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Додати запис
          </button>
          <button onClick={prevDay} className="p-2 rounded-full hover:bg-gray-200 transition border bg-white" aria-label="Попередній день">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={nextDay} className="p-2 rounded-full hover:bg-gray-200 transition border bg-white" aria-label="Наступний день">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* --- Модальне вікно додавання запису --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800">Новий запис</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Назва заняття *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Наприклад: Робототехніка"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Викладач
                </label>
                <input
                  type="text"
                  value={newInstructor}
                  onChange={(e) => setNewInstructor(e.target.value)}
                  placeholder="Ім'я викладача"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Час початку
                  </label>
                  <select
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    {TIME_SLOTS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тривалість
                  </label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Періодичність
                </label>
                <select
                  value={newRecurrence}
                  onChange={(e) => setNewRecurrence(e.target.value as RecurrenceType)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {newRecurrence !== 'none' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Запис буде повторюватися {getRecurrenceLabel(newRecurrence).toLowerCase()} без обмежень
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Колір
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setNewColor(color.value)}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        color.value.includes('blue') ? 'bg-blue-300' :
                        color.value.includes('green') ? 'bg-green-300' :
                        color.value.includes('purple') ? 'bg-purple-300' :
                        color.value.includes('yellow') ? 'bg-yellow-300' :
                        color.value.includes('red') ? 'bg-red-300' :
                        'bg-pink-300'
                      } ${newColor === color.value ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition font-medium"
              >
                Скасувати
              </button>
              <button
                onClick={handleAddActivity}
                disabled={!newTitle.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Додати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Модальне вікно редагування/видалення --- */}
      {isEditModalOpen && editingInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800">Редагувати запис</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Інформація про повторення */}
              {editingInstance.activity.recurrence !== 'none' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Повторюваний запис: {getRecurrenceLabel(editingInstance.activity.recurrence).toLowerCase()}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Назва заняття *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  В��кладач
                </label>
                <input
                  type="text"
                  value={editInstructor}
                  onChange={(e) => setEditInstructor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Час початку
                  </label>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    {TIME_SLOTS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тривалість
                  </label>
                  <select
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Періодичність
                </label>
                <select
                  value={editRecurrence}
                  onChange={(e) => setEditRecurrence(e.target.value as RecurrenceType)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Колір
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setEditColor(color.value)}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        color.value.includes('blue') ? 'bg-blue-300' :
                        color.value.includes('green') ? 'bg-green-300' :
                        color.value.includes('purple') ? 'bg-purple-300' :
                        color.value.includes('yellow') ? 'bg-yellow-300' :
                        color.value.includes('red') ? 'bg-red-300' :
                        'bg-pink-300'
                      } ${editColor === color.value ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Опції видалення */}
              <div className="border-t pt-4 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Видалити
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deleteMode"
                      value="single"
                      checked={deleteMode === 'single'}
                      onChange={() => setDeleteMode('single')}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="text-sm text-gray-700">Тільки цей запис</span>
                  </label>
                  {editingInstance.activity.recurrence !== 'none' && (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deleteMode"
                          value="future"
                          checked={deleteMode === 'future'}
                          onChange={() => setDeleteMode('future')}
                          className="w-4 h-4 text-red-600"
                        />
                        <span className="text-sm text-gray-700">Цей та всі майбутні</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deleteMode"
                          value="all"
                          checked={deleteMode === 'all'}
                          onChange={() => setDeleteMode('all')}
                          className="w-4 h-4 text-red-600"
                        />
                        <span className="text-sm text-gray-700">Всю серію повністю</span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={handleDeleteActivity}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Видалити
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition font-medium"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleSaveActivity}
                  disabled={!editTitle.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pencil className="w-4 h-4" />
                  Зберегти
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Сітка календаря --- */}
      <div className="flex flex-1 overflow-y-auto">
        {/* Колонка годин */}
        <div className="flex-shrink-0 w-16 border-r bg-gray-50/50">
          {hours_ticks.map((hour) => (
            <div key={hour} className="relative border-b border-gray-100" style={{ height: `${HOUR_HEIGHT_PX}px` }}>
              <span className="absolute -top-2.5 right-2 text-xs text-gray-400 font-medium bg-gray-50/50 px-1">
                {hour.toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Область занять */}
        <div className="flex-1 relative">
          {hours_ticks.map((hour) => (
            <div key={hour} className="border-b border-gray-100 border-dashed" style={{ height: `${HOUR_HEIGHT_PX}px` }} />
          ))}

          {/* Картки занять */}
          {todaysInstances.map((instance, index) => {
            const overlappingCount = todaysInstances.filter(
              (other, otherIndex) =>
                otherIndex !== index &&
                instance.startTime < other.endTime &&
                instance.endTime > other.startTime
            ).length;
            const width = overlappingCount > 0 ? `calc(${100 / (overlappingCount + 1)}% - 8px)` : 'calc(100% - 16px)';
            const leftOffset = overlappingCount > 0 
              ? `calc(${(index % (overlappingCount + 1)) * (100 / (overlappingCount + 1))}% + 8px)` 
              : '8px';

            return (
              <button
                type="button"
                key={`${instance.activity.id}-${format(instance.date, 'yyyy-MM-dd')}`}
                onClick={() => openEditModal(instance)}
                className={`absolute rounded-lg border p-2 cursor-pointer transition-all duration-150 text-left ${instance.activity.color}`}
                style={{
                  top: `${calculateTopOffset(instance.startTime)}px`,
                  height: `${Math.max(calculateHeight(instance.activity.durationMinutes), 30)}px`,
                  left: leftOffset,
                  width: width,
                  zIndex: 10 + index,
                }}
              >
                <div className="flex items-start gap-1">
                  <p className="font-semibold text-sm truncate flex-1">{instance.activity.title}</p>
                  {instance.activity.recurrence !== 'none' && (
                    <RefreshCw className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-60" />
                  )}
                </div>
                {instance.activity.durationMinutes >= 45 && (
                  <p className="text-xs opacity-75 truncate">{instance.activity.instructorName}</p>
                )}
                <p className="text-xs opacity-60 mt-0.5">
                  {format(instance.startTime, 'HH:mm')} - {format(instance.endTime, 'HH:mm')}
                </p>
              </button>
            );
          })}

          {/* Лінія поточного часу */}
          {isSameDay(currentDate, new Date()) && (
            <CurrentTimeLine />
          )}
        </div>
      </div>
    </div>
  );
};

// Компонент лінії поточного часу
const CurrentTimeLine = () => {
  const [now, setNow] = useState(new Date());

  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const top = calculateTopOffset(now);
  
  if (now.getHours() < START_HOUR || now.getHours() > END_HOUR) return null;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5" />
        <div className="flex-1 h-0.5 bg-red-500" />
      </div>
    </div>
  );
};

export default DayCalendarView;
