import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  Calendar,
  UserCog,
  Menu,
  X,
  GraduationCap,
  UsersRound,
  Receipt,
  Wallet,
  ClipboardList,
  UtensilsCrossed,
  Landmark,
  Shield,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { canAccessSection } from '@/lib/permissions';

const navigation = [
  { name: 'Дашборд', href: '/', icon: LayoutDashboard, section: 'dashboard' },
  { name: 'Діти', href: '/students', icon: Users, section: 'students' },
  { name: 'Активності', href: '/activities', icon: BookOpen, section: 'activities' },
  { name: 'Рахунки', href: '/accounts', icon: Landmark, section: 'accounts' },
  { name: 'Журнал', href: '/attendance', icon: Calendar, section: 'attendance' },
  { name: 'Журнал відвідування', href: '/garden-attendance', icon: ClipboardList, section: 'garden_attendance' },
  { name: 'Відомість харчування', href: '/nutrition-report', icon: UtensilsCrossed, section: 'nutrition' },
  { name: 'Групи', href: '/groups', icon: UsersRound, section: 'groups' },
  { name: 'Персонал', href: '/staff', icon: UserCog, section: 'staff' },
  { name: 'Журнал витрат', href: '/staff-expenses', icon: Receipt, section: 'staff_expenses' },
  { name: 'Ведомість', href: '/staff-payroll', icon: Wallet, section: 'staff_payroll' },
  { name: 'Користувачі', href: '/users', icon: Shield, section: 'users' },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role, signOut } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const navItems = role === 'parent'
    ? [{ name: 'Кабінет', href: '/parent', icon: User }]
    : navigation.filter((item) => canAccessSection(role, item.section));

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link
          key={item.name}
          to={item.href}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            isActive(item.href)
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.name}
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Horizontal Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
        <div className="w-full px-2 sm:px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img src="/logoiris.png" alt="Iris" className="h-10 w-10" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLinks />
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={signOut} className="hidden md:inline-flex">
              Вийти
            </Button>
            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[250px]">
                <div className="flex flex-col gap-2 mt-8">
                  <NavLinks />
                  <Button variant="ghost" onClick={signOut} className="justify-start">
                    Вийти
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
