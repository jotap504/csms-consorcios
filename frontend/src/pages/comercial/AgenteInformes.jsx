import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

export default function AgenteInformes() {
  const [informes, setInformes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get('/comercial/agente/informes').then(({ data }) => { setInformes(data); setLoading(false); });
  }, []);

  async function handleDescargar(inf) {
    try {
      const response = await api.get(`/comercial/agente/informes/${inf.id}/descargar`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inf.nombre}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el informe.');
    }
  }

  return (
    <AdminLayout title="Informes generados" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Informes generados por el agente de tareas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : informes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavia no hay informes. Pedile al agente de tareas (dentro del chat, pestaña "Agente de tareas") que genere un reporte del embudo comercial.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Generado por</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {informes.map((inf) => (
                  <TableRow key={inf.id}>
                    <TableCell>{inf.nombre}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{inf.creado_por_nombre || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(inf.creado_en).toLocaleString('es-AR')}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleDescargar(inf)}>
                        <Download className="h-4 w-4" /><span className="hidden sm:inline">Descargar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
