import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Camera, FileUp, CheckCircle2, FileBadge,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const SELECT_CLASS = 'flex h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function tableroVacio() { return { topologia: 'Trifasica', amperaje: '', seccion_cable: '' }; }
function cargadorVacio() { return { marca_modelo: '', potencia_kw: '', fases: 'Monofasico' }; }

export default function RelevamientoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fotoInputRef = useRef(null);
  const docInputRef = useRef(null);

  const [rel, setRel] = useState(null);
  const [form, setForm] = useState(null);
  const [tableros, setTableros] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [generador, setGenerador] = useState({
    potencia_kva: '', marca_modelo: '', corriente_nominal: '', ajuste_disparo_pct: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [informes, setInformes] = useState([]);
  const [generando, setGenerando] = useState(false);

  async function load() {
    const { data } = await api.get(`/comercial/relevamientos/${id}`);
    setRel(data);
    setForm({
      edificio_nombre: data.edificio_nombre || '',
      direccion: data.direccion || '',
      uf_count: data.uf_count ?? '',
      cocheras_count: data.cocheras_count ?? '',
      tarifa_categoria: data.tarifa_categoria || '',
      potencia_contratada: data.potencia_contratada ?? '',
      demanda_maxima: data.demanda_maxima ?? '',
      fecha_demanda_maxima: data.fecha_demanda_maxima ? String(data.fecha_demanda_maxima).slice(0, 10) : '',
      notas: data.notas || '',
    });
    setTableros(data.tableros?.length ? data.tableros : []);
    setCargadores(data.cargadores_existentes?.length ? data.cargadores_existentes : []);
    setGenerador(data.generador || { potencia_kva: '', marca_modelo: '', corriente_nominal: '', ajuste_disparo_pct: '' });
    const { data: informesData } = await api.get(`/comercial/relevamientos/${id}/informes`);
    setInformes(informesData);
  }

  async function handleGenerarInforme() {
    setGenerando(true);
    try {
      const { data } = await api.post(`/comercial/relevamientos/${id}/informes`, {});
      navigate(`/comercial/informes/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo generar el informe.');
    } finally {
      setGenerando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(estadoOverride) {
    setSaving(true);
    try {
      const body = {
        ...form,
        uf_count: form.uf_count === '' ? null : Number(form.uf_count),
        cocheras_count: form.cocheras_count === '' ? null : Number(form.cocheras_count),
        potencia_contratada: form.potencia_contratada === '' ? null : Number(form.potencia_contratada),
        demanda_maxima: form.demanda_maxima === '' ? null : Number(form.demanda_maxima),
        fecha_demanda_maxima: form.fecha_demanda_maxima || null,
        tableros,
        cargadores_existentes: cargadores,
        generador: generador.marca_modelo || generador.potencia_kva ? generador : null,
      };
      if (estadoOverride) body.estado = estadoOverride;
      await api.put(`/comercial/relevamientos/${id}`, body);
      toast.success(estadoOverride === 'revisado' ? 'Relevamiento marcado como revisado.' : 'Relevamiento guardado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file, tipo) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('tipo', tipo);
      const { data } = await api.post(`/comercial/relevamientos/${id}/archivos`, formData);
      // Solo actualiza fotos/documentos/estado - no pisa lo que el usuario
      // esta tipeando en el resto del formulario todavia sin guardar.
      setRel((prev) => ({ ...prev, fotos: data.fotos, documentos: data.documentos }));
      toast.success(tipo === 'foto' ? 'Foto agregada.' : 'Documento agregado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  if (!rel || !form) {
    return (
      <AdminLayout title="Relevamiento" navItems={SUPERADMIN_NAV}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`Relevamiento - ${rel.apellido}, ${rel.nombre}`} navItems={SUPERADMIN_NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/contactos/${rel.contacto_id}`)}>
          <ArrowLeft className="h-4 w-4" />Volver al contacto
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={rel.estado === 'revisado' ? 'accent' : 'muted'}>{rel.estado}</Badge>
          <Button size="sm" variant="outline" loading={saving} onClick={() => handleSave()}>Guardar</Button>
          {rel.estado === 'borrador' && (
            <Button size="sm" loading={saving} onClick={() => handleSave('revisado')}><CheckCircle2 className="h-4 w-4" />Marcar revisado</Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Datos generales</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="rEdificio">Edificio / Instalacion</Label>
              <Input id="rEdificio" className="h-11" value={form.edificio_nombre} onChange={(e) => setForm({ ...form, edificio_nombre: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="rDireccion">Direccion</Label>
              <Input id="rDireccion" className="h-11" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rUf">Unidades funcionales</Label>
              <Input id="rUf" className="h-11" type="number" min="0" value={form.uf_count} onChange={(e) => setForm({ ...form, uf_count: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rCocheras">Plazas de estacionamiento</Label>
              <Input id="rCocheras" className="h-11" type="number" min="0" value={form.cocheras_count} onChange={(e) => setForm({ ...form, cocheras_count: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tableros de medidores (TMM)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {tableros.map((t, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label>Topologia</Label>
                  <select className={SELECT_CLASS} value={t.topologia} onChange={(e) => setTableros((prev) => prev.map((x, j) => (j === i ? { ...x, topologia: e.target.value } : x)))}>
                    <option>Trifasica</option>
                    <option>Monofasica</option>
                  </select>
                </div>
                <div className="flex-1">
                  <Label>Amperaje</Label>
                  <Input className="h-11" placeholder="Ej: 63A" value={t.amperaje} onChange={(e) => setTableros((prev) => prev.map((x, j) => (j === i ? { ...x, amperaje: e.target.value } : x)))} />
                </div>
                <div className="flex-1">
                  <Label>Seccion de cable</Label>
                  <Input className="h-11" placeholder="Ej: 16mm2" value={t.seccion_cable} onChange={(e) => setTableros((prev) => prev.map((x, j) => (j === i ? { ...x, seccion_cable: e.target.value } : x)))} />
                </div>
                <Button size="sm" variant="destructive" onClick={() => setTableros((prev) => prev.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setTableros((prev) => [...prev, tableroVacio()])}><Plus className="h-4 w-4" />Agregar tablero</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Suministro EDENOR / EDESUR</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rTarifa">Categoria tarifaria</Label>
              <select id="rTarifa" className={SELECT_CLASS} value={form.tarifa_categoria} onChange={(e) => setForm({ ...form, tarifa_categoria: e.target.value })}>
                <option value="">Sin definir</option>
                <option value="T1">T1 - Pequenas demandas (hasta 10kW)</option>
                <option value="T2">T2 - Medianas demandas (10-50kW)</option>
                <option value="T3">T3 - Grandes demandas (+50kW)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="rPotencia">Potencia contratada (kW)</Label>
              <Input id="rPotencia" className="h-11" type="number" step="0.01" value={form.potencia_contratada} onChange={(e) => setForm({ ...form, potencia_contratada: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rDemanda">Demanda maxima registrada (kW)</Label>
              <Input id="rDemanda" className="h-11" type="number" step="0.01" value={form.demanda_maxima} onChange={(e) => setForm({ ...form, demanda_maxima: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rFechaDemanda">Fecha de la lectura</Label>
              <Input id="rFechaDemanda" className="h-11" type="date" value={form.fecha_demanda_maxima} onChange={(e) => setForm({ ...form, fecha_demanda_maxima: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Grupo electrogeno (si tiene)</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Potencia nominal (kVA)</Label>
              <Input className="h-11" type="number" step="0.01" value={generador.potencia_kva} onChange={(e) => setGenerador({ ...generador, potencia_kva: e.target.value })} />
            </div>
            <div>
              <Label>Marca / modelo proteccion</Label>
              <Input className="h-11" value={generador.marca_modelo} onChange={(e) => setGenerador({ ...generador, marca_modelo: e.target.value })} />
            </div>
            <div>
              <Label>Corriente nominal (A)</Label>
              <Input className="h-11" type="number" step="0.01" value={generador.corriente_nominal} onChange={(e) => setGenerador({ ...generador, corriente_nominal: e.target.value })} />
            </div>
            <div>
              <Label>Ajuste de disparo (%)</Label>
              <Input className="h-11" type="number" step="1" value={generador.ajuste_disparo_pct} onChange={(e) => setGenerador({ ...generador, ajuste_disparo_pct: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cargadores existentes</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cargadores.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label>Marca / modelo</Label>
                  <Input className="h-11" value={c.marca_modelo} onChange={(e) => setCargadores((prev) => prev.map((x, j) => (j === i ? { ...x, marca_modelo: e.target.value } : x)))} />
                </div>
                <div className="flex-1">
                  <Label>Potencia (kW)</Label>
                  <Input className="h-11" type="number" step="0.1" value={c.potencia_kw} onChange={(e) => setCargadores((prev) => prev.map((x, j) => (j === i ? { ...x, potencia_kw: e.target.value } : x)))} />
                </div>
                <div className="flex-1">
                  <Label>Fases</Label>
                  <select className={SELECT_CLASS} value={c.fases} onChange={(e) => setCargadores((prev) => prev.map((x, j) => (j === i ? { ...x, fases: e.target.value } : x)))}>
                    <option>Monofasico</option>
                    <option>Trifasico</option>
                  </select>
                </div>
                <Button size="sm" variant="destructive" onClick={() => setCargadores((prev) => prev.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCargadores((prev) => [...prev, cargadorVacio()])}><Plus className="h-4 w-4" />Agregar cargador existente</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fotos y documentos</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fotos del tablero / instalacion</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {(rel.fotos ?? []).map((f, i) => (
                  <a key={i} href={`/api/comercial/archivos/${f.filename}`} target="_blank" rel="noopener noreferrer">
                    <img src={`/api/comercial/archivos/${f.filename}`} alt={f.nombre} className="h-20 w-20 rounded-lg border border-border object-cover" />
                  </a>
                ))}
              </div>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0], 'foto')}
              />
              <Button size="sm" variant="outline" loading={uploading} onClick={() => fotoInputRef.current?.click()}>
                <Camera className="h-4 w-4" />Sacar / subir foto
              </Button>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos (factura EDENOR/EDESUR, planos, etc.)</p>
              <div className="mb-2 flex flex-col gap-1">
                {(rel.documentos ?? []).map((d, i) => (
                  <a key={i} href={`/api/comercial/archivos/${d.filename}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                    {d.nombre}
                  </a>
                ))}
              </div>
              <input
                ref={docInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0], 'documento')}
              />
              <Button size="sm" variant="outline" loading={uploading} onClick={() => docInputRef.current?.click()}>
                <FileUp className="h-4 w-4" />Subir documento
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Informe tecnico</CardTitle>
            <Button size="sm" loading={generando} onClick={handleGenerarInforme}>
              <FileBadge className="h-4 w-4" />Generar informe
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Genera el dictamen con los calculos de ingenieria (corriente por fase, margen de potencia, capacidad del generador) a partir de los datos cargados arriba. Guarda primero los cambios.
            </p>
            {informes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin informes generados todavia.</p>
            ) : (
              informes.map((inf) => (
                <Link
                  key={inf.id}
                  to={`/comercial/informes/${inf.id}`}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                >
                  <span>Version {inf.version}</span>
                  <Badge variant={inf.estado === 'firmado' ? 'accent' : 'muted'}>{inf.estado}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
          <CardContent>
            <textarea
              rows={4}
              className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </CardContent>
        </Card>

        <Button loading={saving} onClick={() => handleSave()} className="h-12">Guardar relevamiento</Button>
      </div>
    </AdminLayout>
  );
}
