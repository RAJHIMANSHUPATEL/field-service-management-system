import {
  BarChart3,
  Bell,
  Calendar,
  ClipboardList,
  FileText,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { AuthUser } from "@/features/auth/api/auth.api";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useLogout } from "@/features/auth/hooks/useLogin";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const roleLabel: Record<AuthUser["role"], string> = {
  ADMIN: "Admin",
  OPS: "Ops",
  TECHNICIAN: "Technician",
  CUSTOMER: "Customer",
};

const navButtonClass =
  "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground";

function navForRole(role: AuthUser["role"]): NavGroup[] {
  if (role === "ADMIN" || role === "OPS") {
    return [
      {
        label: "Overview",
        items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Operations",
        items: [
          { to: "/requests", label: "Requests", icon: ClipboardList },
          { to: "/work-orders", label: "Work orders", icon: ListChecks },
          { to: "/schedule", label: "Scheduling", icon: Calendar },
        ],
      },
      {
        label: "Directory",
        items: [
          { to: "/customers", label: "Customers", icon: Users },
          { to: "/assets", label: "Assets", icon: Package },
          { to: "/technicians", label: "Technicians", icon: HardHat },
        ],
      },
      {
        label: "Inventory",
        items: [{ to: "/inventory", label: "Parts and stock", icon: Warehouse }],
      },
      {
        label: "Finance",
        items: [
          { to: "/invoices", label: "Invoices", icon: Receipt },
          { to: "/contracts", label: "Contracts and maintenance", icon: FileText },
        ],
      },
      {
        label: "Insights",
        items: [{ to: "/analytics", label: "Analytics", icon: BarChart3 }],
      },
      {
        label: "System",
        items: [
          { to: "/notifications", label: "Notifications", icon: Bell },
          ...(role === "ADMIN" ? [{ to: "/users", label: "Users and roles", icon: Shield }] : []),
          { to: "/master", label: "Master data", icon: Settings },
          ...(role === "ADMIN" ? [{ to: "/audit", label: "Audit log", icon: ScrollText }] : []),
          { to: "/service-types", label: "Service types", icon: Wrench },
        ],
      },
    ];
  }
  if (role === "CUSTOMER") {
    return [
      {
        label: "Workspace",
        items: [
          { to: "/equipment", label: "Equipment", icon: Package },
          { to: "/requests", label: "Requests", icon: ClipboardList },
        ],
      },
    ];
  }
  return [
    {
      label: "Workspace",
      items: [
        { to: "/my-jobs", label: "My jobs", icon: ListChecks },
        { to: "/schedule", label: "My schedule", icon: Calendar },
        { to: "/profile", label: "Profile", icon: Users },
      ],
    },
  ];
}

function initials(name: string) {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function isItemActive(pathname: string, to: string) {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

const sectionLabels: Record<string, string> = {
  customers: "Customers",
  "service-types": "Service types",
  technicians: "Technicians",
  requests: "Requests",
  "work-orders": "Work orders",
  equipment: "Equipment",
  profile: "Profile",
  schedule: "Scheduling",
  assets: "Assets",
  inventory: "Parts and stock",
  invoices: "Invoices",
  contracts: "Contracts and maintenance",
  analytics: "Analytics",
  notifications: "Notifications",
  users: "Users and roles",
  master: "Master data",
  audit: "Audit log",
};

function crumbsForPath(pathname: string): { label: string; to?: string }[] {
  if (pathname === "/") {
    return [{ label: "Dashboard" }];
  }
  if (pathname.startsWith("/customers/")) {
    return [
      { label: "Customers", to: "/customers" },
      { label: "Customer" },
    ];
  }
  if (pathname === "/customers") {
    return [{ label: "Dashboard", to: "/" }, { label: "Customers" }];
  }
  if (pathname === "/service-types") {
    return [{ label: "Dashboard", to: "/" }, { label: "Service types" }];
  }
  if (pathname === "/technicians") {
    return [{ label: "Dashboard", to: "/" }, { label: "Technicians" }];
  }
  if (pathname.startsWith("/requests/")) {
    return [
      { label: "Requests", to: "/requests" },
      { label: "Request" },
    ];
  }
  if (pathname === "/requests") {
    return [{ label: "Dashboard", to: "/" }, { label: "Requests" }];
  }
  if (pathname.startsWith("/work-orders/")) {
    return [
      { label: "Work orders", to: "/work-orders" },
      { label: "Work order" },
    ];
  }
  if (pathname === "/work-orders") {
    return [{ label: "Dashboard", to: "/" }, { label: "Work orders" }];
  }
  if (pathname === "/equipment") {
    return [{ label: "Equipment" }];
  }
  if (pathname === "/profile") {
    return [{ label: "Profile" }];
  }

  const section = pathname.split("/").filter(Boolean)[0];
  const label = section ? sectionLabels[section] : undefined;
  if (label && pathname === `/${section}`) {
    return [{ label: "Dashboard", to: "/" }, { label }];
  }

  return [{ label: "Page not found" }];
}

function AppSidebar({ user }: { user: AuthUser }) {
  const { pathname } = useLocation();
  const groups = navForRole(user.role);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="FieldOps" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                F
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-base font-semibold text-sidebar-primary-foreground">
                  Field<span className="text-sidebar-ring">Ops</span>
                </span>
                <span className="truncate text-xs text-sidebar-foreground">{user.organization.name}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isItemActive(pathname, item.to)}
                      tooltip={item.label}
                      className={navButtonClass}
                      render={<Link to={item.to} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="ml-auto" />}>
        <Avatar size="sm">
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="max-w-40 truncate">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{roleLabel[user.role]}</DropdownMenuLabel>
          <DropdownMenuItem disabled={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const currentUser = useCurrentUser();
  const { pathname } = useLocation();
  const user = currentUser.data;
  const crumbs = crumbsForPath(pathname);

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <Fragment key={crumb.label}>
                    {index > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>
                      {last || !crumb.to ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
          <UserMenu user={user} />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">
          {children ?? <Outlet />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
