import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Upload, Sparkles, Send, Inbox, CheckSquare, Square,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import EnviarCampaniaDialog from '@/components/EnviarCampaniaDialog';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const ESTADOS = [
  'Nuevo', 'Contactado', 'Interesado', 'Reunion agendada', 'Relevamiento tecnico',
  'Presupuesto enviado', 'Negociacion', 'Ganado', 'Perdido', 'Pausado',
];
const TIPOS_CONTACTO = ['Socio/a', 'Egresado', 'Administrador', 'Consorcista', 'Proveedor', 'Otros'];
const FILTROS = [
  { value: '', label: 'Todos los contactos' },
  { value: 'no_contactados', label: 'Nunca contactados' },
  { value: 'sin_respuesta', label: 'Sin respuesta' },
  { value: 'inactivos_30d', label: 'Sin contacto hace +30 dias' },
  { value: 'sin_email', label: 'Sin email cargado' },
];

const EMPTY_FORM = {
  apellido: '', nombre: '', tipo_contacto: 'Otros', email: '', administracion_empresa: '',
  cuit: '', telefono: '', zona: '', origen: '', interes_principal: '', prioridad: 'Media',
};

const ALERTA_BADGE = {
  Vencido: 'destructive',
  Hoy: 'default',
  'Proximos 7 dias': 'accent',
  'Sin fecha': 'muted',
  'No contactar': 'muted',
};

export default function Contactos() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zona, setZona] = useState('');
  const [origen, setOrigen] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const importFileRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importCandidatos, setImportCandidatos] = useState(null);
  const [importSaving, setImportSaving] = useState(false);

  const [contactosSeleccionados, setContactosSeleccionados] = useState(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [campaniaIdInicial, setCampaniaIdInicial] = useState(null);
  const [revisandoBandeja, setRevisandoBandeja] = useState(false);

  const FILTER_KEYS = ['estado', 'filtro', 'tipo_contacto'];
  const estado = params.get('estado') || '';
  const filtro = params.get('filtro') || '';
  const tipoContacto = params.get('tipo_contacto') || '';
  const campaniaIdParam = params.get('campania_id');

  function updateParams(patch) {
    const next = {};
    FILTER_KEYS.forEach((key) => {
      const value = patch[key] !== undefined ? patch[key] : (params.get(key) || '');
      if (value) next[key] = value;
    });
    setParams(next);
  }

  async function load() {
    setLoading(true);
    const { data } = await api.get('/comercial/contactos', {
      params: {
        estado: estado || undefined,
        filtro: filtro || undefined,
        search: search || undefined,
        tipo_contacto: tipoContacto || undefined,
        zona: zona || undefined,
        origen: origen || undefined,
      },
    });
    setContactos(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, filtro, tipoContacto]);

  useEffect(() => {
    if (campaniaIdParam) {
      setCampaniaIdInicial(Number(campaniaIdParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seleccionarTodos() {
    setContactosSeleccionados(new Set(
      contactos.filter((c) => c.email && !c.no_contactar).map((c) => c.id),
    ));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/comercial/contactos', form);
      setOpen(false);
      setForm(EMPTY_FORM);
      toast.success('Contacto creado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el contacto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportarPreview(file) {
    if (!file) return;
    setImportLoading(true);
    setImportCandidatos(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/comercial/contactos/importar-preview', formData);
      setImportCandidatos(data.map((c) => ({ ...c, incluir: !c.duplicado })));
      if (data.length === 0) toast.error('No se encontraron contactos en el archivo.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo analizar el archivo.');
    } finally {
      setImportLoading(false);
    }
  }

  function updateCandidato(idx, patch) {
    setImportCandidatos((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function handleImportarConfirmar() {
    const seleccionados = importCandidatos.filter((c) => c.incluir);
    if (seleccionados.length === 0) {
      toast.error('Selecciona al menos un contacto.');
      return;
    }
    setImportSaving(true);
    try {
      const { data } = await api.post('/comercial/contactos/importar-confirmar', { contactos: seleccionados });
      toast.success(`${data.creados} contacto(s) importado(s).`);
      setImportOpen(false);
      setImportCandidatos(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo importar.');
    } finally {
      setImportSaving(false);
    }
  }

  function toggleSeleccionado(id) {
    setContactosSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleCampaniaEnviada(data) {
    toast.success(data.estado === 'programado'
      ? `Envío programado para ${data.total_destinatarios} contacto(s). Arranca solo en la fecha/hora elegida.`
      : `Envío iniciado para ${data.total_destinatarios} contacto(s). Se va a completar en varios días (revisá el progreso en la campaña).`);
    setPickerOpen(false);
    setCampaniaIdInicial(null);
    setContactosSeleccionados(new Set());
    load();
  }

  async function handleRevisarBandeja() {
    setRevisandoBandeja(true);
    try {
      const { data } = await api.post('/comercial/bandeja/revisar');
      toast.success(`${data.procesados.length} mail(s) nuevo(s) procesado(s).${data.sin_match.length > 0 ? ` ${data.sin_match.length} de remitentes desconocidos.` : ''}`);
      if (data.procesados.length > 0) load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo revisar la bandeja.');
    } finally {
      setRevisandoBandeja(false);
    }
  }

  return (
    <AdminLayout title="Contactos" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle>Contactos {estado && <span className="text-sm font-normal text-muted-foreground">- {estado}</span>}</CardTitle>
          <div className="flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-center">
            <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap gap-2">
              <Input placeholder="Buscar nombre, email, empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-56" />
              <Input placeholder="Zona..." value={zona} onChange={(e) => setZona(e.target.value)} className="w-full sm:w-32" />
              <Input placeholder="Origen..." value={origen} onChange={(e) => setOrigen(e.target.value)} className="w-full sm:w-32" />
              <Button type="submit" size="sm" variant="outline" className="shrink-0">Buscar</Button>
            </form>
            <select
              className={`${SELECT_CLASS} w-full sm:w-44`}
              value={estado}
              onChange={(e) => updateParams({ estado: e.target.value })}
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select
              className={`${SELECT_CLASS} w-full sm:w-44`}
              value={tipoContacto}
              onChange={(e) => updateParams({ tipo_contacto: e.target.value })}
            >
              <option value="">Todos los tipos</option>
              {TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className={`${SELECT_CLASS} w-full sm:w-52`}
              value={filtro}
              onChange={(e) => updateParams({ filtro: e.target.value })}
            >
              {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.txt,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) { setImportOpen(true); handleImportarPreview(file); }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => importFileRef.current?.click()}>
              <Upload className="h-4 w-4" />Importar
            </Button>
            <Button size="sm" variant="outline" loading={revisandoBandeja} onClick={handleRevisarBandeja}>
              <Inbox className="h-4 w-4" />Revisar bandeja
            </Button>
            {contactos.length > 0 && (
              contactosSeleccionados.size > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setContactosSeleccionados(new Set())}>
                  <Square className="h-4 w-4" />Deseleccionar todos
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={seleccionarTodos}>
                  <CheckSquare className="h-4 w-4" />Seleccionar todos ({contactos.length})
                </Button>
              )
            )}
            {contactosSeleccionados.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <Send className="h-4 w-4" />Enviar campaña ({contactosSeleccionados.size})
              </Button>
            )}
            <EnviarCampaniaDialog
              open={pickerOpen}
              onOpenChange={(o) => { setPickerOpen(o); if (!o) setCampaniaIdInicial(null); }}
              contactoIds={[...contactosSeleccionados]}
              campaniaInicialId={campaniaIdInicial}
              onEnviado={handleCampaniaEnviada}
            />
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(EMPTY_FORM); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4" />Nuevo contacto</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo contacto</DialogTitle>
                  <DialogDescription>Se crea con estado "Nuevo".</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cApellido">Apellido</Label>
                      <Input id="cApellido" required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cNombre">Nombre</Label>
                      <Input id="cNombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cTipo">Tipo de contacto</Label>
                    <select id="cTipo" value={form.tipo_contacto} onChange={(e) => setForm({ ...form, tipo_contacto: e.target.value })} className={SELECT_CLASS}>
                      {TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cEmail">Email</Label>
                    <Input id="cEmail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="cAdmin">Administracion / Empresa</Label>
                    <Input id="cAdmin" value={form.administracion_empresa} onChange={(e) => setForm({ ...form, administracion_empresa: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cCuit">CUIT</Label>
                      <Input id="cCuit" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cTelefono">Telefono / WhatsApp</Label>
                      <Input id="cTelefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cZona">Zona</Label>
                      <Input id="cZona" value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cOrigen">Origen</Label>
                      <Input id="cOrigen" value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cInteres">Interes principal</Label>
                    <Input id="cInteres" value={form.interes_principal} onChange={(e) => setForm({ ...form, interes_principal: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="cPrioridad">Prioridad</Label>
                    <select id="cPrioridad" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className={SELECT_CLASS}>
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                  <Button type="submit" className="mt-2" loading={saving}>Crear contacto</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportCandidatos(null); }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Importar contactos</DialogTitle>
                  <DialogDescription>
                    Excel, CSV, PDF, imagen o texto - la IA extrae los contactos y los muestra aca para que revises antes de cargarlos.
                  </DialogDescription>
                </DialogHeader>

                {importLoading && <p className="text-sm text-muted-foreground">Analizando archivo...</p>}

                {importCandidatos && (
                  <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                    {importCandidatos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No se encontraron contactos.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead />
                            <TableHead>Nombre</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Empresa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importCandidatos.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <input type="checkbox" checked={c.incluir} onChange={(e) => updateCandidato(i, { incluir: e.target.checked })} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-40" value={`${c.apellido || ''}`} onChange={(e) => updateCandidato(i, { apellido: e.target.value })} placeholder="Apellido" />
                                <Input className="mt-1 h-8 w-40" value={`${c.nombre || ''}`} onChange={(e) => updateCandidato(i, { nombre: e.target.value })} placeholder="Nombre" />
                              </TableCell>
                              <TableCell>
                                <select className={`${SELECT_CLASS} h-8 w-32`} value={c.tipo_contacto || 'Otros'} onChange={(e) => updateCandidato(i, { tipo_contacto: e.target.value })}>
                                  {TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-40" value={c.email || ''} onChange={(e) => updateCandidato(i, { email: e.target.value })} />
                                {c.duplicado && <Badge variant="destructive" className="mt-1">Ya existe</Badge>}
                              </TableCell>
                              <TableCell><Input className="h-8 w-36" value={c.administracion_empresa || ''} onChange={(e) => updateCandidato(i, { administracion_empresa: e.target.value })} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <Button loading={importSaving} onClick={handleImportarConfirmar} className="self-end">
                      Importar {importCandidatos.filter((c) => c.incluir).length} contacto(s)
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {campaniaIdInicial && !pickerOpen && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 p-2.5 text-sm">
              <span>Campaña elegida: seleccioná los contactos y hacé click en &quot;Enviar campaña&quot;.</span>
              <Button size="sm" variant="ghost" onClick={() => setCampaniaIdInicial(null)}>Cancelar</Button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : contactos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Contacto</TableHead>
                  <TableHead className="hidden md:table-cell">Administracion / Empresa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Prioridad</TableHead>
                  <TableHead className="hidden lg:table-cell">Responsable</TableHead>
                  <TableHead className="hidden lg:table-cell">Proxima accion</TableHead>
                  <TableHead className="hidden sm:table-cell">Alerta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactos.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/comercial/contactos/${c.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={contactosSeleccionados.has(c.id)}
                        onChange={() => toggleSeleccionado(c.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{c.apellido}, {c.nombre}</p>
                      <p className="text-xs text-muted-foreground">{c.email || c.codigo}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{c.administracion_empresa || '-'}</TableCell>
                    <TableCell><Badge variant="muted">{c.estado_comercial}</Badge></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={c.prioridad === 'Alta' ? 'destructive' : c.prioridad === 'Media' ? 'default' : 'muted'}>{c.prioridad}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{c.responsable_nombre || '-'}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{c.fecha_proxima_accion ? String(c.fecha_proxima_accion).slice(0, 10) : '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={ALERTA_BADGE[c.alerta] ?? 'muted'}>{c.alerta}</Badge>
                      {c.motivo_baja && <p className="mt-1 text-[11px] text-muted-foreground">{c.motivo_baja}</p>}
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
