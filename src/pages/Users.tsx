import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { useUserProfiles, useUpdateUserProfile, useCreateUser } from '@/hooks/useUserProfiles';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { UserRole } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  viewer: 'Viewer',
  parent: 'Parent',
  newregistration: 'New registration',
};

const createUserSchema = z.object({
  email: z.string().email('Невірний формат email'),
  password: z.string().min(6, 'Пароль має бути мінімум 6 символів'),
  parentName: z.string().min(1, 'ФІО батька обов\'язкове'),
  childName: z.string().min(1, 'ФІО дитини обов\'язкове'),
  role: z.enum(['owner', 'admin', 'manager', 'accountant', 'viewer', 'parent', 'newregistration']),
  isActive: z.boolean(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function Users() {
  const { role } = useAuth();
  const { data: profiles = [], isLoading } = useUserProfiles();
  const updateProfile = useUpdateUserProfile();
  const createUser = useCreateUser();
  const isReadOnly = role !== 'owner';
  const [authDebugEnabled, setAuthDebugEnabled] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const createUserForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      password: '',
      parentName: '',
      childName: '',
      role: 'parent',
      isActive: false,
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAuthDebugEnabled(window.localStorage.getItem('auth_debug') === '1');
  }, []);

  const handleAuthDebugToggle = (checked: boolean) => {
    setAuthDebugEnabled(checked);
    if (typeof window === 'undefined') return;
    if (checked) {
      window.localStorage.setItem('auth_debug', '1');
    } else {
      window.localStorage.removeItem('auth_debug');
    }
  };

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => a.created_at.localeCompare(b.created_at))
  ), [profiles]);

  const onCreateUserSubmit = async (data: CreateUserFormData) => {
    try {
      await createUser.mutateAsync({
        email: data.email,
        password: data.password,
        parentName: data.parentName,
        childName: data.childName,
        role: data.role,
        isActive: data.isActive,
      });
      createUserForm.reset();
      setIsCreateDialogOpen(false);
      // Обновляем список пользователей после успешного создания
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
        queryClient.refetchQueries({ queryKey: ['user_profiles'] });
      }, 1000);
    } catch (error) {
      // Ошибка уже обработана в useCreateUser
      console.error('[Users] Create user error', error);
      // Даже при ошибке проверяем, не был ли пользователь создан
      // Если была ошибка CORS, но пользователь создан, обновляем список
      setTimeout(() => {
        // Обновляем список пользователей через 2 секунды
        // Это даст время на создание пользователя, если он был создан
        console.log('[Users] Refetching profiles after error...');
        queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
        queryClient.refetchQueries({ queryKey: ['user_profiles'] });
      }, 2000);
    }
  };

  return (
    <>
      <PageHeader title="Користувачі" description={`${profiles.length} користувачів`} />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Діагностика авторизації</div>
                <div className="text-xs text-muted-foreground">
                  Вмикає логування процесу авторизації в консоль (тег [Auth]).
                </div>
              </div>
              <Switch checked={authDebugEnabled} onCheckedChange={handleAuthDebugToggle} />
            </div>
          </div>
          
          {!isReadOnly && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Створити користувача</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Створити нового користувача</DialogTitle>
                </DialogHeader>
                <form onSubmit={createUserForm.handleSubmit(onCreateUserSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-email">Email</Label>
                    <Input
                      id="create-email"
                      type="email"
                      placeholder="email@example.com"
                      {...createUserForm.register('email')}
                      disabled={createUser.isPending}
                    />
                    {createUserForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {createUserForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-password">Пароль</Label>
                    <Input
                      id="create-password"
                      type="password"
                      placeholder="Мінімум 6 символів"
                      {...createUserForm.register('password')}
                      disabled={createUser.isPending}
                    />
                    {createUserForm.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {createUserForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-parent-name">ФІО батька</Label>
                    <Input
                      id="create-parent-name"
                      type="text"
                      placeholder="Повне ім'я батька"
                      {...createUserForm.register('parentName')}
                      disabled={createUser.isPending}
                    />
                    {createUserForm.formState.errors.parentName && (
                      <p className="text-sm text-destructive">
                        {createUserForm.formState.errors.parentName.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-child-name">ФІО дитини</Label>
                    <Input
                      id="create-child-name"
                      type="text"
                      placeholder="Повне ім'я дитини"
                      {...createUserForm.register('childName')}
                      disabled={createUser.isPending}
                    />
                    {createUserForm.formState.errors.childName && (
                      <p className="text-sm text-destructive">
                        {createUserForm.formState.errors.childName.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-role">Роль</Label>
                    <Select
                      value={createUserForm.watch('role')}
                      onValueChange={(value) => createUserForm.setValue('role', value as UserRole)}
                      disabled={createUser.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="create-is-active"
                      checked={createUserForm.watch('isActive')}
                      onCheckedChange={(checked) => createUserForm.setValue('isActive', checked)}
                      disabled={createUser.isPending}
                    />
                    <Label htmlFor="create-is-active" className="cursor-pointer">
                      Активний (може входити в систему)
                    </Label>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreateDialogOpen(false);
                        createUserForm.reset();
                      }}
                      disabled={createUser.isPending}
                    >
                      Скасувати
                    </Button>
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending ? 'Створення...' : 'Створити'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Користувач</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Активний</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProfiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{profile.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground break-all">{profile.id}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={profile.role}
                        onValueChange={(value) => updateProfile.mutate({ id: profile.id, role: value as UserRole })}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={profile.is_active}
                        onCheckedChange={(checked) => updateProfile.mutate({ id: profile.id, is_active: checked })}
                        disabled={isReadOnly}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
