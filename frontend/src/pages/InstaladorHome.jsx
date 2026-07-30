import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Building2, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import Layout from '@/components/Layout';
import { Card, CardContent } from '@/components/ui';

const navItems = [{ to: '/instalador', label: 'Consorcios', icon: Wrench, end: true }];

export default function InstaladorHome() {
  const [consorcios, setConsorcios] = useState([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get('/admin/consorcios').then((res) => setConsorcios(res.data));
  }, []);

  return (
    <Layout title="Consorcios" navItems={navItems}>
      <p className="mb-4 text-sm text-muted-foreground">
        Selecciona un consorcio para instalar o configurar sus cargadores.
      </p>
      {consorcios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay consorcios cargados todavia.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {consorcios.map((c) => (
            <Link key={c.id} to={`/admin/consorcio/${c.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-4.5 w-4.5" />
                    </div>
                    <span className="font-medium">{c.nombre}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
