import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Landing from '@/pages/Landing';
import Hero2 from '@/pages/Hero2';
import Hero3 from '@/pages/Hero3';
import Hero4 from '@/pages/Hero4';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SuperAdminHome from '@/pages/superadmin/Dashboard';
import Edificios from '@/pages/superadmin/Edificios';
import SuperAdminCargadores from '@/pages/superadmin/Cargadores';
import Fabricas from '@/pages/superadmin/Fabricas';
import Proveedores from '@/pages/superadmin/Proveedores';
import Catalogo from '@/pages/superadmin/Catalogo';
import Contabilidad from '@/pages/superadmin/Contabilidad';
import Usuarios from '@/pages/superadmin/Usuarios';
import Alarmas from '@/pages/superadmin/Alarmas';
import ComercialDashboard from '@/pages/comercial/Dashboard';
import ComercialContactos from '@/pages/comercial/Contactos';
import ComercialContactoDetalle from '@/pages/comercial/ContactoDetalle';
import ComercialBandeja from '@/pages/comercial/Bandeja';
import ComercialCampanias from '@/pages/comercial/Campanias';
import ComercialCatalogo from '@/pages/comercial/Catalogo';
import PresupuestoEditor from '@/pages/comercial/PresupuestoEditor';
import PresupuestoImprimir from '@/pages/comercial/PresupuestoImprimir';
import CotizadorWizard from '@/pages/comercial/CotizadorWizard';
import CotizacionImprimir from '@/pages/comercial/CotizacionImprimir';
import CotizacionBOMInterno from '@/pages/comercial/CotizacionBOMInterno';
import RelevamientoEditor from '@/pages/comercial/RelevamientoEditor';
import InformeVer from '@/pages/comercial/InformeVer';
import InformeImprimir from '@/pages/comercial/InformeImprimir';
import AgenteInformes from '@/pages/comercial/AgenteInformes';
import StockPage from '@/pages/StockPage';
import InstaladorHome from '@/pages/InstaladorHome';
import AdminConsorcio from '@/pages/AdminConsorcio';
import ConsorcioDashboard from '@/pages/ConsorcioDashboard';
import ResidenteDashboard from '@/pages/ResidenteDashboard';
import ProveedorDashboard from '@/pages/ProveedorDashboard';
import OcppPublicTest from '@/pages/OcppPublicTest';
import OcppConexiones from '@/pages/OcppConexiones';
import OcppSelfTest from '@/pages/OcppSelfTest';
import CargarCarga from '@/pages/CargarCarga';
import ProtectedRoute from '@/components/ProtectedRoute';
import AsistenteChat from '@/components/AsistenteChat';
import { getSession, homeForRole } from '@/lib/auth';

function RootRedirect() {
  const session = getSession();
  return <Navigate to={session ? homeForRole(session.rol) : '/login'} replace />;
}

function Root() {
  const session = getSession();
  if (session) return <Navigate to={homeForRole(session.rol)} replace />;
  return <Landing />;
}

export default function App() {
  useLocation(); // se suscribe al router para forzar el re-render de App en cada
  // navegacion - sin esto, getSession() queda con el valor de cuando App
  // se monto por primera vez (login navega sin recargar la pagina).
  const session = getSession();
  return (
    <>
    {session && <AsistenteChat />}
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/hero2" element={<Hero2 />} />
      <Route path="/hero3" element={<Hero3 />} />
      <Route path="/hero4" element={<Hero4 />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute role="superadmin">
            <SuperAdminHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/edificios"
        element={
          <ProtectedRoute role="superadmin">
            <Edificios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/cargadores"
        element={
          <ProtectedRoute role="superadmin">
            <SuperAdminCargadores />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/fabricas"
        element={
          <ProtectedRoute role="superadmin">
            <Fabricas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/proveedores"
        element={
          <ProtectedRoute role="superadmin">
            <Proveedores />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/catalogo"
        element={
          <ProtectedRoute role="superadmin">
            <Catalogo />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/contabilidad"
        element={
          <ProtectedRoute role="superadmin">
            <Contabilidad />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/usuarios"
        element={
          <ProtectedRoute role="superadmin">
            <Usuarios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/alarmas"
        element={
          <ProtectedRoute role="superadmin">
            <Alarmas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/contactos"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialContactos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/contactos/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialContactoDetalle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/bandeja"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialBandeja />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/campanias"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialCampanias />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/informes-generados"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <AgenteInformes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/catalogo"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <ComercialCatalogo />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/presupuestos/:id/imprimir"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <PresupuestoImprimir />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/informes/:id/imprimir"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <InformeImprimir />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/informes/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <InformeVer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/relevamientos/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <RelevamientoEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/presupuestos/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <PresupuestoEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/cotizaciones/:id/imprimir"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <CotizacionImprimir />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/cotizaciones/:id/bom"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <CotizacionBOMInterno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/comercial/cotizaciones/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'comercial']}>
            <CotizadorWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/stock"
        element={
          <ProtectedRoute roles={['superadmin', 'instalador']}>
            <StockPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instalador"
        element={
          <ProtectedRoute role="instalador">
            <InstaladorHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/consorcio/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'instalador']}>
            <AdminConsorcio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consorcio"
        element={
          <ProtectedRoute role="consorcio_admin">
            <ConsorcioDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/residente"
        element={
          <ProtectedRoute role="residente">
            <ResidenteDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/proveedor"
        element={
          <ProtectedRoute role="proveedor">
            <ProveedorDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/ocpp-test" element={<OcppPublicTest />} />
      <Route path="/ocpp-log" element={<OcppConexiones />} />
      <Route path="/ocpp-selftest" element={<OcppSelfTest />} />
      <Route
        path="/cargar/:ocppId"
        element={
          <ProtectedRoute role="residente">
            <CargarCarga />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
    </>
  );
}
