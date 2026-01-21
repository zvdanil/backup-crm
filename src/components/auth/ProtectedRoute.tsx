import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const { user, role, profile, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (profile && (!profile.is_active || role === 'newregistration')) {
    if (location.pathname !== '/pending') {
      return <Navigate to="/pending" replace />;
    }
  } else if (location.pathname === '/pending') {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const fallback = role === 'parent' ? '/parent' : '/';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
