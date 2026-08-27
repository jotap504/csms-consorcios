import {
  LayoutDashboard, Building2, Zap, Truck, Package, Receipt, Wallet, Factory, Handshake, Users, Inbox, Megaphone, UserCog,
} from 'lucide-react';

// Compartido por todas las paginas del lado superadmin (sidebar de AdminLayout).
// Agrupado en 2 secciones con encabezado + linea divisoria: Comercial y
// Operaciones. Dashboard queda arriba de todo, sin agrupar.
export const SUPERADMIN_NAV = [
  { to: '/superadmin', label: 'Dashboard', icon: LayoutDashboard, end: true },

  { to: '/comercial', label: 'Comercial', icon: Users, section: 'Comercial' },
  { to: '/comercial/bandeja', label: 'Bandeja', icon: Inbox },
  { to: '/comercial/campanias', label: 'Campañas', icon: Megaphone },

  { to: '/superadmin/edificios', label: 'Locaciones', icon: Building2, section: 'Operaciones' },
  { to: '/superadmin/contabilidad', label: 'Contabilidad', icon: Wallet },
  { to: '/superadmin/catalogo', label: 'Catalogo de abonos', icon: Receipt },
  { to: '/superadmin/cargadores', label: 'Cargadores', icon: Zap },
  { to: '/superadmin/proveedores', label: 'Proveedores', icon: Handshake },
  { to: '/superadmin/fabricas', label: 'Fabricas', icon: Factory },
  { to: '/superadmin/stock', label: 'Stock', icon: Package },
  { to: '/superadmin/usuarios', label: 'Usuarios', icon: UserCog },
];
