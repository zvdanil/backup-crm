import React, { useState, useMemo, useRef } from 'react';
import { Printer, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useActivities } from '@/hooks/useActivities';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useGroups } from '@/hooks/useGroups';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatDateString } from '@/lib/attendance';
import { isGardenAttendanceController } from '@/lib/gardenAttendance';
import type { GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface NutritionRecord {
  studentId: string;
  studentName: string;
  activityId: string;
  activityName: string;
  groupId: string | null;
  groupName: string | null;
}

type SortField = 'studentName' | 'activityName' | 'groupName';
type SortOrder = 'asc' | 'desc';
type NutritionType = 'half_day' | 'full_day' | 'other';

const getNutritionType = (activityName: string): NutritionType => {
  const name = activityName.toLowerCase();
  if (name.includes('пів дня') || name.includes('пол дня') || name.includes('полдня')) {
    return 'half_day';
  }
  if (name.includes('повний день') || name.includes('полный день') || name.includes('повний')) {
    return 'full_day';
  }
  return 'other';
};

export default function NutritionReport() {
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(formatDateString(now));
  const [sortBy, setSortBy] = useState<SortField>('studentName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const printRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { data: activities = [] } = useActivities();
  const { data: groups = [] } = useGroups();
  const { data: allEnrollments = [] } = useEnrollments({ activeOnly: true });

  // Find controller activities (Garden Attendance Journal)
  const controllerActivities = useMemo(() => {
    return activities.filter(activity => isGardenAttendanceController(activity));
  }, [activities]);

  // Get all food tariff IDs from all controller activities
  const foodTariffIds = useMemo(() => {
    const ids = new Set<string>();
    controllerActivities.forEach(activity => {
      const config = (activity.config as GardenAttendanceConfig) || {};
      (config.food_tariff_ids || []).forEach(id => ids.add(id));
    });
    return ids;
  }, [controllerActivities]);

  // Get controller activity IDs
  const controllerActivityIds = useMemo(() => {
    return controllerActivities.map(a => a.id);
  }, [controllerActivities]);

  // Fetch attendance data for controller activities (Source A)
  const { data: controllerAttendanceData = [], isLoading: isLoadingController } = useQuery({
    queryKey: ['nutrition-report-controller', selectedDate, controllerActivityIds],
    queryFn: async () => {
      if (controllerActivityIds.length === 0) return [];

      // Get all attendance records for controller activities on selected date with status 'present'
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          enrollment_id,
          date,
          status,
          enrollments!inner (
            id,
            student_id,
            activity_id,
            students (
              id,
              full_name,
              group_id,
              groups (
                id,
                name
              )
            )
          )
        `)
        .eq('date', selectedDate)
        .eq('status', 'present')
        .in('enrollments.activity_id', controllerActivityIds);

      if (error) throw error;
      return data || [];
    },
    enabled: controllerActivityIds.length > 0,
    refetchOnWindowFocus: true,
  });

  // Fetch attendance data for food tariff activities (Source B)
  const { data: foodAttendanceData = [], isLoading: isLoadingFood } = useQuery({
    queryKey: ['nutrition-report-food', selectedDate, Array.from(foodTariffIds)],
    queryFn: async () => {
      if (foodTariffIds.size === 0) return [];

      // Get all attendance records for food tariff activities on selected date with status 'present'
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          enrollment_id,
          date,
          status,
          enrollments!inner (
            id,
            student_id,
            activity_id,
            students (
              id,
              full_name,
              group_id,
              groups (
                id,
                name
              )
            ),
            activities (
              id,
              name
            )
          )
        `)
        .eq('date', selectedDate)
        .eq('status', 'present')
        .in('enrollments.activity_id', Array.from(foodTariffIds));

      if (error) throw error;
      return data || [];
    },
    enabled: foodTariffIds.size > 0,
    refetchOnWindowFocus: true,
  });

  const isLoading = isLoadingController || isLoadingFood;

  // Process nutrition records
  const nutritionRecords = useMemo(() => {
    const records: NutritionRecord[] = [];
    const studentsFromGardenJournal = new Set<string>();

    // Source A: Garden Attendance Journal
    // Get students with controller activity enrollment and status 'present'
    controllerAttendanceData.forEach((attendance: any) => {
      const enrollment = attendance.enrollments;
      if (!enrollment || !enrollment.students) return;

      const studentId = enrollment.students.id;
      const groupId = enrollment.students.group_id;
      const group = enrollment.students.groups;
      const groupName = group?.name || null;
      const enrollmentActivityId = enrollment.activity_id;

      // Find which controller activity this enrollment belongs to
      const controllerActivity = controllerActivities.find(
        ca => ca.id === enrollmentActivityId
      );

      if (controllerActivity) {
        // This student is from Garden Attendance Journal
        studentsFromGardenJournal.add(studentId);

        // Find food tariff enrollment for this student
        const config = (controllerActivity.config as GardenAttendanceConfig) || {};
        const configFoodTariffIds = config.food_tariff_ids || [];
        
        // Find food tariff enrollment
        const foodEnrollment = allEnrollments.find(
          e => e.student_id === studentId && 
               e.is_active && 
               configFoodTariffIds.includes(e.activity_id)
        );

        if (foodEnrollment) {
          const foodActivity = activities.find(a => a.id === foodEnrollment.activity_id);
          if (foodActivity) {
            records.push({
              studentId,
              studentName: enrollment.students.full_name,
              activityId: foodEnrollment.activity_id,
              activityName: foodActivity.name,
              groupId,
              groupName,
            });
          }
        }
      }
    });

    // Source B: Other journals (food tariff activities, excluding Garden Journal students)
    foodAttendanceData.forEach((attendance: any) => {
      const enrollment = attendance.enrollments;
      if (!enrollment || !enrollment.students || !enrollment.activities) return;

      const studentId = enrollment.students.id;
      
      // Skip if this student is already included from Garden Journal
      if (studentsFromGardenJournal.has(studentId)) {
        return;
      }

      const activityId = enrollment.activity_id;
      if (foodTariffIds.has(activityId)) {
        const groupId = enrollment.students.group_id;
        const group = enrollment.students.groups;
        const groupName = group?.name || null;

        records.push({
          studentId,
          studentName: enrollment.students.full_name,
          activityId,
          activityName: enrollment.activities.name,
          groupId,
          groupName,
        });
      }
    });

    // Remove duplicates (same student + activity combination)
    const uniqueRecords = new Map<string, NutritionRecord>();
    records.forEach(record => {
      const key = `${record.studentId}-${record.activityId}`;
      if (!uniqueRecords.has(key)) {
        uniqueRecords.set(key, record);
      }
    });

    return Array.from(uniqueRecords.values());
  }, [controllerAttendanceData, foodAttendanceData, controllerActivities, allEnrollments, foodTariffIds, activities]);

  // Sort records
  const sortedRecords = useMemo(() => {
    const records = [...nutritionRecords];
    
    console.log('[NutritionReport] Sorting records:', {
      totalRecords: records.length,
      sortBy,
      sortOrder,
      beforeSort: records.slice(0, 3).map(r => ({ name: r.studentName, group: r.groupName, activity: r.activityName }))
    });
    
    records.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'studentName') {
        comparison = a.studentName.localeCompare(b.studentName, 'uk');
      } else if (sortBy === 'activityName') {
        comparison = a.activityName.localeCompare(b.activityName, 'uk');
      } else if (sortBy === 'groupName') {
        const groupA = a.groupName || '';
        const groupB = b.groupName || '';
        comparison = groupA.localeCompare(groupB, 'uk');
        // Если группы одинаковые, сортируем по ФИО
        if (comparison === 0) {
          comparison = a.studentName.localeCompare(b.studentName, 'uk');
        }
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    const sortedList = records.map(r => `${r.studentName} | ${r.activityName} | ${r.groupName || '—'}`);
    console.log('[NutritionReport] Sorted records (FULL ORDER):', sortedList);
    
    return records;
  }, [nutritionRecords, sortBy, sortOrder]);

  // Group records by group
  const groupedRecords = useMemo(() => {
    const grouped: Record<string, NutritionRecord[]> = {};
    const noGroup: NutritionRecord[] = [];

    // Since sortedRecords is already sorted, we preserve that order when grouping
    sortedRecords.forEach(record => {
      if (record.groupId && record.groupName) {
        if (!grouped[record.groupId]) {
          grouped[record.groupId] = [];
        }
        grouped[record.groupId].push(record);
      } else {
        noGroup.push(record);
      }
    });

    console.log('[NutritionReport] Grouped records (before sorting groups):');
    Object.keys(grouped).forEach(groupId => {
      const group = groups.find(g => g.id === groupId);
      const groupName = group?.name || 'Unknown';
      const recordList = grouped[groupId].map(r => `${r.studentName} | ${r.activityName}`);
      console.log(`  Group "${groupName}":`, recordList);
    });
    if (noGroup.length > 0) {
      const noGroupList = noGroup.map(r => `${r.studentName} | ${r.activityName}`);
      console.log('  No Group:', noGroupList);
    }

    // Sort groups - preserve the order from sortedRecords (first appearance of each group)
    // This ensures that when sorting by activityName or studentName, groups appear in the order
    // they first appear in the sorted list, not alphabetically
    const sortedGroups = Object.entries(grouped).sort((a, b) => {
      // Always use the order from sortedRecords (first appearance of each group)
      const firstIndexA = sortedRecords.findIndex(r => r.groupId === a[0]);
      const firstIndexB = sortedRecords.findIndex(r => r.groupId === b[0]);
      return firstIndexA - firstIndexB;
    });

    console.log('[NutritionReport] Final grouped records (AFTER sorting groups - THIS IS WHAT USER SEES):');
    sortedGroups.forEach(([groupId]) => {
      const group = groups.find(g => g.id === groupId);
      const groupName = group?.name || 'Unknown';
      const recordList = grouped[groupId].map(r => `${r.studentName} | ${r.activityName}`);
      console.log(`  Group "${groupName}":`, recordList);
    });
    if (noGroup.length > 0) {
      const noGroupList = noGroup.map(r => `${r.studentName} | ${r.activityName}`);
      console.log('  No Group:', noGroupList);
    }

    return { grouped: Object.fromEntries(sortedGroups), noGroup };
  }, [sortedRecords, groups, sortBy]);

  // Calculate totals
  const totalPortions = sortedRecords.length;
  const nutritionTypeTotals = useMemo(() => {
    return sortedRecords.reduce(
      (acc, record) => {
        const type = getNutritionType(record.activityName);
        if (type === 'half_day') acc.halfDay += 1;
        if (type === 'full_day') acc.fullDay += 1;
        acc.total += 1;
        return acc;
      },
      { halfDay: 0, fullDay: 0, total: 0 }
    );
  }, [sortedRecords]);
  const totalsByGroup = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(groupedRecords.grouped).forEach(([groupId, records]) => {
      totals[groupId] = records.length;
    });
    if (groupedRecords.noGroup.length > 0) {
      totals['none'] = groupedRecords.noGroup.length;
    }
    return totals;
  }, [groupedRecords]);

  // Handle print
  const handlePrint = () => {
    if (!printRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = printRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Відомість харчування - ${selectedDate}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            h2 { text-align: center; color: #666; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .group-header { background-color: #e9ecef; font-weight: bold; }
            .total-row { background-color: #f8f9fa; font-weight: bold; }
            .no-print { display: none; }
          </style>
        </head>
        <body>
          <h1>Відомість харчування</h1>
          <h2>${selectedDate}</h2>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Відомість харчування" description="Звіт для кухні" />
      
      <div className="p-8 space-y-6">
        {/* Header with date picker, sorting, and total */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Вибір дати та сортування
              </CardTitle>
              <Button onClick={handlePrint} variant="outline" className="gap-2">
                <Printer className="h-4 w-4" />
                Друк
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label htmlFor="date">Дата:</Label>
                  <input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-4 py-2 border rounded-md"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="sort-by">Сортування:</Label>
                  <Select value={sortBy} onValueChange={(value) => {
                    console.log('[NutritionReport] sortBy changed:', value);
                    setSortBy(value as SortField);
                  }}>
                    <SelectTrigger id="sort-by" className="w-[200px]">
                      <SelectValue placeholder="Виберіть поле сортування" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studentName">По ФІО</SelectItem>
                      <SelectItem value="activityName">По типу харчування</SelectItem>
                      <SelectItem value="groupName">По групі</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="sort-order">Напрямок:</Label>
                  <Select value={sortOrder} onValueChange={(value) => {
                    console.log('[NutritionReport] sortOrder changed:', value);
                    setSortOrder(value as SortOrder);
                  }}>
                    <SelectTrigger id="sort-order" className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">За зростанням</SelectItem>
                      <SelectItem value="desc">За спаданням</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">
                Всього порцій: {totalPortions}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main table */}
        <div ref={printRef}>
          <Card>
            <CardHeader>
              <CardTitle>Список дітей</CardTitle>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div className="space-y-3">
                  {sortedRecords.map((record, index) => (
                    <div key={`${record.studentId}-${record.activityId}`} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {index + 1}. {record.studentName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{record.groupName || '—'}</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {record.activityName}
                        </div>
                      </div>
                    </div>
                  ))}

                  {totalPortions === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      Немає дітей з харчуванням на вибрану дату
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>№</TableHead>
                        <TableHead>ПІБ дитини</TableHead>
                        <TableHead>Тип харчування</TableHead>
                        <TableHead>Група</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Display all records in sorted order (not grouped) */}
                      {sortedRecords.map((record, index) => (
                        <TableRow key={`${record.studentId}-${record.activityId}`}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{record.studentName}</TableCell>
                          <TableCell>{record.activityName}</TableCell>
                          <TableCell>{record.groupName || '—'}</TableCell>
                        </TableRow>
                      ))}

                      {totalPortions === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Немає дітей з харчуванням на вибрану дату
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {totalPortions > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Підсумки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <p className="font-medium mb-2">За типом харчування</p>
                    <div className="text-sm text-muted-foreground">
                      <div>Пів дня: {nutritionTypeTotals.halfDay}</div>
                      <div>Повний день: {nutritionTypeTotals.fullDay}</div>
                      <div className="font-semibold text-foreground">Всього: {nutritionTypeTotals.total}</div>
                    </div>
                  </div>
                  <div className="rounded-md border p-4">
                    <p className="font-medium mb-2">За групами</p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {Object.entries(totalsByGroup).map(([groupId, count]) => {
                        const groupName = groupId === 'none'
                          ? 'Без групи'
                          : groups.find(g => g.id === groupId)?.name || 'Невідома група';
                        return (
                          <div key={`summary-${groupId}`}>
                            {groupName}: {count}
                          </div>
                        );
                      })}
                      <div className="font-semibold text-foreground">Всього: {totalPortions}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}