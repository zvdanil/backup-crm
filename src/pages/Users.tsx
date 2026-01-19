import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useUserProfiles, useUpdateUserProfile } from '@/hooks/useUserProfiles';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UserRole } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  viewer: 'Viewer',
  parent: 'Parent',
};

export default function Users() {
  const { role } = useAuth();
  const { data: profiles = [], isLoading } = useUserProfiles();
  const updateProfile = useUpdateUserProfile();
  const isReadOnly = role !== 'owner';

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => a.created_at.localeCompare(b.created_at))
  ), [profiles]);

  return (
    <>
      <PageHeader title="Користувачі" description={`${profiles.length} користувачів`} />
      <div className="p-8">
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
