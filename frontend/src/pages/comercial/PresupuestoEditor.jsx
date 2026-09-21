import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Printer, Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const money = (n, moneda = 'ARS') => `${moneda === 'USD' ? 'US$' : '$'}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function opcionVacia() {
  return { nombre: 'Opcion nueva', items: [], mano_obra: [] };
}

function calcularOpcion(op) {
  const subtotalMateriales = op.items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario || 0), 0);
  const subtotalManoObra = op.mano_obra.reduce((s, m) => s + Number(m.monto || 0), 0);
  return { subtotal_materiales: subtotalMateriales, subtotal_mano_obra: subtotalManoObra, total: subtotalMateriales + subtotalManoObra };
}

export default function PresupuestoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [presupuesto, setPresupuesto] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [clausulas, setClausulas] = useState('');
  const [validezHasta, setValidezHasta] = useState('');
  const [moneda, setMoneda] = useState('ARS');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: p }, { data: cat }] = await Promise.all([
      api.get(`/comercial/presupuestos/${id}`),
      api.get('/comercial/catalogo-items'),
    ]);
    setPresupuesto(p);
    setOpciones(p.opciones?.length ? p.opciones : [opcionVacia()]);
    setClausulas(p.clausulas || '');
    setValidezHasta(p.validez_hasta ? String(p.validez_hasta).slice(0, 10) : '');
    setMoneda(p.moneda || 'ARS');
    setCatalogo(cat);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateOpcion(idx, patch) {
    setOpciones((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function addOpcion() { setOpciones((prev) => [...prev, opcionVacia()]); }
  function removeOpcion(idx) { setOpciones((prev) => prev.filter((_, i) => i !== idx)); }

  function addItem(opIdx, catalogoItem) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : {
      ...o,
      items: [...o.items, {
        catalogo_item_id: catalogoItem.id, nombre: catalogoItem.nombre, unidad: catalogoItem.unidad,
        cantidad: 1, precio_unitario: Number(catalogoItem.precio_unitario),
      }],
    })));
  }
  function updateItem(opIdx, itemIdx, patch) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : {
      ...o, items: o.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it)),
    })));
  }
  function removeItem(opIdx, itemIdx) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : { ...o, items: o.items.filter((_, j) => j !== itemIdx) })));
  }

  function addManoObra(opIdx) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : { ...o, mano_obra: [...o.mano_obra, { concepto: '', monto: 0 }] })));
  }
  function updateManoObra(opIdx, moIdx, patch) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : {
      ...o, mano_obra: o.mano_obra.map((m, j) => (j === moIdx ? { ...m, ...patch } : m)),
    })));
  }
  function removeManoObra(opIdx, moIdx) {
    setOpciones((prev) => prev.map((o, i) => (i !== opIdx ? o : { ...o, mano_obra: o.mano_obra.filter((_, j) => j !== moIdx) })));
  }

  async function handleSave(estadoOverride) {
    setSaving(true);
    try {
      const opcionesConTotales = opciones.map((o) => ({ ...o, ...calcularOpcion(o) }));
      const body = {
        opciones: opcionesConTotales, clausulas, validez_hasta: validezHasta || null, moneda,
      };
      if (estadoOverride) body.estado = estadoOverride;
      await api.put(`/comercial/presupuestos/${id}`, body);
      toast.success(estadoOverride === 'enviado' ? 'Presupuesto marcado como enviado.' : 'Presupuesto guardado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!presupuesto) {
    return (
      <AdminLayout title="Presupuesto" navItems={SUPERADMIN_NAV}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  const totalGeneral = opciones.reduce((s, o) => s + calcularOpcion(o).total, 0);

  return (
    <AdminLayout title={`Presupuesto - ${presupuesto.apellido}, ${presupuesto.nombre}`} navItems={SUPERADMIN_NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/contactos/${presupuesto.contacto_id}`)}>
          <ArrowLeft className="h-4 w-4" />Volver al contacto
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={presupuesto.estado === 'enviado' ? 'accent' : presupuesto.estado === 'aprobado' ? 'accent' : presupuesto.estado === 'rechazado' ? 'destructive' : 'muted'}>
            {presupuesto.estado}
          </Badge>
          <Link to={`/comercial/presupuestos/${id}/imprimir`} target="_blank">
            <Button size="sm" variant="outline"><Printer className="h-4 w-4" />Vista de impresion</Button>
          </Link>
          <Button size="sm" variant="outline" loading={saving} onClick={() => handleSave()}>Guardar</Button>
          {presupuesto.estado === 'borrador' && (
            <Button size="sm" loading={saving} onClick={() => handleSave('enviado')}><Send className="h-4 w-4" />Marcar enviado</Button>
          )}
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
          <div>
            <Label>Fecha</Label>
            <p className="pt-2 text-sm">{String(presupuesto.fecha).slice(0, 10)}</p>
          </div>
          <div>
            <Label htmlFor="pValidez">Validez hasta</Label>
            <Input id="pValidez" type="date" value={validezHasta} onChange={(e) => setValidezHasta(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pMoneda">Moneda</Label>
            <select id="pMoneda" className={SELECT_CLASS} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="ARS">Pesos (ARS)</option>
              <option value="USD">Dolares (USD)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {opciones.map((opcion, opIdx) => {
        const calc = calcularOpcion(opcion);
        return (
          <Card key={opIdx} className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <Input
                value={opcion.nombre}
                onChange={(e) => updateOpcion(opIdx, { nombre: e.target.value })}
                className="max-w-sm flex-1 text-base font-semibold"
              />
              {opciones.length > 1 && (
                <Button size="sm" variant="destructive" onClick={() => removeOpcion(opIdx)}><Trash2 className="h-4 w-4" /></Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Materiales</p>
                <div className="flex flex-col gap-2">
                  {opcion.items.map((it, itemIdx) => (
                    <div key={itemIdx} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-full sm:w-auto sm:flex-1">{it.nombre}</span>
                      <Input
                        type="number" min="0" step="0.01" value={it.cantidad}
                        onChange={(e) => updateItem(opIdx, itemIdx, { cantidad: e.target.value })}
                        className="w-20"
                      />
                      <span className="w-16 text-xs text-muted-foreground">{it.unidad}</span>
                      <Input
                        type="number" min="0" step="0.01" value={it.precio_unitario}
                        onChange={(e) => updateItem(opIdx, itemIdx, { precio_unitario: e.target.value })}
                        className="w-24"
                      />
                      <span className="w-24 text-right tabular-nums">{money(Number(it.cantidad || 0) * Number(it.precio_unitario || 0), moneda)}</span>
                      <Button size="sm" variant="destructive" onClick={() => removeItem(opIdx, itemIdx)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <select
                  className={`${SELECT_CLASS} mt-2`}
                  value=""
                  onChange={(e) => {
                    const item = catalogo.find((c) => String(c.id) === e.target.value);
                    if (item) addItem(opIdx, item);
                  }}
                >
                  <option value="">+ Agregar item del catalogo...</option>
                  {catalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({money(c.precio_unitario, moneda)}/{c.unidad})</option>)}
                </select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mano de obra</p>
                <div className="flex flex-col gap-2">
                  {opcion.mano_obra.map((m, moIdx) => (
                    <div key={moIdx} className="flex flex-wrap items-center gap-2 text-sm">
                      <Input
                        placeholder="Concepto" value={m.concepto}
                        onChange={(e) => updateManoObra(opIdx, moIdx, { concepto: e.target.value })}
                        className="min-w-[140px] flex-1"
                      />
                      <Input
                        type="number" min="0" step="0.01" value={m.monto}
                        onChange={(e) => updateManoObra(opIdx, moIdx, { monto: e.target.value })}
                        className="w-32"
                      />
                      <Button size="sm" variant="destructive" onClick={() => removeManoObra(opIdx, moIdx)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => addManoObra(opIdx)}>
                  <Plus className="h-4 w-4" />Agregar mano de obra
                </Button>
              </div>

              <div className="flex flex-col items-end gap-0.5 border-t border-border pt-3 text-sm">
                <p className="text-muted-foreground">Subtotal materiales: {money(calc.subtotal_materiales, moneda)}</p>
                <p className="text-muted-foreground">Subtotal mano de obra: {money(calc.subtotal_mano_obra, moneda)}</p>
                <p className="text-base font-semibold">Total opcion: {money(calc.total, moneda)}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button size="sm" variant="outline" onClick={addOpcion} className="mb-4"><Plus className="h-4 w-4" />Agregar otra opcion</Button>

      <Card className="mb-4">
        <CardHeader><CardTitle>Clausulas y condiciones comerciales</CardTitle></CardHeader>
        <CardContent>
          <textarea
            rows={5}
            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={clausulas}
            onChange={(e) => setClausulas(e.target.value)}
          />
        </CardContent>
      </Card>

      <p className="text-right text-lg font-semibold">Total general (todas las opciones): {money(totalGeneral, moneda)}</p>
    </AdminLayout>
  );
}
