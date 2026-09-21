import { Building2, Package } from 'lucide-react';

// Sidebar reducido del instalador: solo lo que necesita para trabajar en obra
// (elegir edificio, ver/consumir stock). Sin catalogo/proveedores/ajustes -
// eso es gestion comercial, no instalacion.
export const INSTALADOR_NAV = [
  { to: '/instalador', label: 'Locaciones', icon: Building2, end: true },
  { to: '/superadmin/stock', label: 'Stock', icon: Package },
];
