import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, UserX, Clock, Crown, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowSkeleton } from "@/components/loading-skeleton";
import { formatDistanceToNow, format } from "date-fns";
import { sv } from "date-fns/locale";
import { SEO } from '@/components/seo';
import type { User } from "@shared/schema";

interface UserStats {
  totalUsers: number;
  activeLast7Days: number;
  activeLast30Days: number;
  neverLoggedIn: number;
  freeUsers: number;
  proUsers: number;
  enterpriseUsers: number;
}

export default function AdminUsers() {
  const { data: usersData, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/admin/users/stats'],
  });

  return (
    <div className="space-y-6">
      <SEO title="Admin - Användare" noindex={true} />
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-admin-users-title">Användare</h1>
        <p className="text-muted-foreground">Översikt av alla registrerade användare och aktivitet</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totalt</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-total">{statsLoading ? '...' : stats?.totalUsers ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktiva (7 dagar)</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-stat-7d">{statsLoading ? '...' : stats?.activeLast7Days ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktiva (30 dagar)</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-stat-30d">{statsLoading ? '...' : stats?.activeLast30Days ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aldrig inloggade</CardTitle>
            <UserX className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500" data-testid="text-stat-never">{statsLoading ? '...' : stats?.neverLoggedIn ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Free</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold" data-testid="text-stat-free">{statsLoading ? '...' : stats?.freeUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pro</CardTitle>
            <Crown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-yellow-600" data-testid="text-stat-pro">{statsLoading ? '...' : stats?.proUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enterprise</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-purple-600" data-testid="text-stat-enterprise">{statsLoading ? '...' : stats?.enterpriseUsers ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alla användare</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Senast inloggad</TableHead>
                <TableHead>Registrerad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))
              ) : usersData && usersData.length > 0 ? (
                usersData.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.profileImageUrl ? (
                          <img
                            src={user.profileImageUrl}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                            {(user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')}
                          </div>
                        )}
                        <span className="font-medium" data-testid={`text-username-${user.id}`}>
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
                      {user.email || '—'}
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={user.plan} />
                    </TableCell>
                    <TableCell data-testid={`text-last-login-${user.id}`}>
                      {user.lastLoginAt ? (
                        <span title={format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm')}>
                          {formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true, locale: sv })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Aldrig</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.createdAt
                        ? format(new Date(user.createdAt), 'yyyy-MM-dd')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Inga användare hittades
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string | null }) {
  switch (plan) {
    case 'pro':
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pro</Badge>;
    case 'enterprise':
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Enterprise</Badge>;
    default:
      return <Badge variant="secondary">Free</Badge>;
  }
}
