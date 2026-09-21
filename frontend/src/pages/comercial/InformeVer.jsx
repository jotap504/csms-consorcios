import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Printer, PenTool, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Button, Input, Label, Badge,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  function pos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    drawingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = pos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = pos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full touch-none rounded-lg border border-dashed border-border bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={clear}>Limpiar firma</Button>
    </div>
  );
}

export default function InformeVer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inf, setInf] = useState(null);
  const [firmadoPor, setFirmadoPor] = useState('');
  const [firmadoMatricula, setFirmadoMatricula] = useState('');
  const [firmaDatos, setFirmaDatos] = useState(null);
  const [saving, setSaving] = useState(false);
  const [enviandoMail, setEnviandoMail] = useState(false);

  async function load() {
    const { data } = await api.get(`/comercial/informes/${id}`);
    setInf(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [id]);

  async function handleFirmar() {
    if (!firmadoPor || !firmadoMatricula || !firmaDatos) {
      toast.error('Completa nombre, matricula y dibuja la firma.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/comercial/informes/${id}/firmar`, {
        firmado_por: firmadoPor, firmado_matricula: firmadoMatricula, firma_datos: firmaDatos,
      });
      toast.success('Informe firmado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo firmar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnviarMail() {
    setEnviandoMail(true);
    try {
      const { data } = await api.post(`/comercial/informes/${id}/enviar-mail`);
      toast.success(`Informe enviado por mail a ${data.to}.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar el mail.');
    } finally {
      setEnviandoMail(false);
    }
  }

  if (!inf) {
    return (
      <AdminLayout title="Informe tecnico" navItems={SUPERADMIN_NAV}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  const { calculos } = inf.contenido;

  return (
    <AdminLayout title={`Informe - ${inf.apellido}, ${inf.nombre}`} navItems={SUPERADMIN_NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/relevamientos/${inf.relevamiento_id}`)}>
          <ArrowLeft className="h-4 w-4" />Volver al relevamiento
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={inf.estado === 'firmado' ? 'accent' : 'muted'}>{inf.estado} - v{inf.version}</Badge>
          <Link to={`/comercial/informes/${id}/imprimir`} target="_blank">
            <Button size="sm" variant="outline"><Printer className="h-4 w-4" />Vista de impresion</Button>
          </Link>
          <Button size="sm" variant="outline" loading={enviandoMail} onClick={handleEnviarMail}>
            <Mail className="h-4 w-4" />Enviar por mail
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Cargadores existentes relevados</CardTitle></CardHeader>
          <CardContent>
            {calculos.cargadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se relevaron cargadores individuales instalados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead className="hidden sm:table-cell">Fases</TableHead>
                    <TableHead className="text-right">Potencia</TableHead>
                    <TableHead className="text-right">Corriente calculada</TableHead>
                    <TableHead className="hidden md:table-cell">Observacion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculos.cargadores.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{c.marca_modelo || '-'}</TableCell>
                      <TableCell className="hidden sm:table-cell">{c.fases}</TableCell>
                      <TableCell className="tabular-nums text-right">{c.potencia_kw} kW</TableCell>
                      <TableCell className="tabular-nums text-right">{c.corriente_a} A</TableCell>
                      <TableCell className="hidden max-w-xs text-xs text-muted-foreground md:table-cell">
                        {c.riesgo && <Badge variant="destructive" className="mb-1">Riesgo</Badge>} {c.nota}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Capacidad de suministro</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Potencia contratada:</span> {calculos.suministro.potencia_contratada} kW</p>
            <p><span className="text-muted-foreground">Demanda maxima registrada:</span> {calculos.suministro.demanda_maxima} kW</p>
            <p><span className="text-muted-foreground">Margen:</span> {calculos.suministro.margen_kw} kW</p>
            <p><Badge variant={calculos.suministro.estado.startsWith('Saturado') ? 'destructive' : calculos.suministro.estado === 'Ajustado' ? 'default' : 'accent'}>{calculos.suministro.estado}</Badge></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comparativa tarifaria</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <p className="font-medium">Opcion A - Maximizar Tarifa T2 (49,9 kW)</p>
              <p className="text-muted-foreground">Remanente estimado: {calculos.tarifa_comparativa.opcion_a_remanente_kw} kW. {calculos.tarifa_comparativa.opcion_a_nota}</p>
            </div>
            <div>
              <p className="font-medium">Opcion B - Tarifa T3 (+50 kW)</p>
              <p className="text-muted-foreground">{calculos.tarifa_comparativa.opcion_b_nota}</p>
            </div>
          </CardContent>
        </Card>

        {calculos.generador && (
          <Card>
            <CardHeader><CardTitle>Grupo electrogeno de respaldo</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Potencia nominal:</span> {calculos.generador.potencia_kva} kVA</p>
              <p><span className="text-muted-foreground">Corriente nominal:</span> {calculos.generador.corriente_nominal} A</p>
              <p><span className="text-muted-foreground">Ajuste de disparo:</span> {calculos.generador.ajuste_disparo_pct}%</p>
              <p><span className="text-muted-foreground">Corriente real disponible:</span> {calculos.generador.corriente_real_a} A</p>
              <p className="sm:col-span-2 font-medium">Potencia activa maxima disponible: {calculos.generador.potencia_max_kw} kW</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PenTool className="h-4 w-4" />Firma digital</CardTitle></CardHeader>
          <CardContent>
            {inf.estado === 'firmado' ? (
              <div className="flex flex-col gap-2 text-sm">
                <p><span className="text-muted-foreground">Firmado por:</span> {inf.firmado_por} - Matricula {inf.firmado_matricula}</p>
                <p className="text-muted-foreground">{new Date(inf.fecha_firma).toLocaleString('es-AR')}</p>
                {inf.firma_datos && <img src={inf.firma_datos} alt="Firma" className="mt-2 h-24 w-auto rounded border border-border bg-white" />}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Firma interna de la firma emisora (no reemplaza una firma electronica certificada ante organismos oficiales). Debe completarla un ingeniero o electricista matriculado.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fPor">Nombre completo</Label>
                    <Input id="fPor" value={firmadoPor} onChange={(e) => setFirmadoPor(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="fMatricula">Matricula (ej: COPIME N123456)</Label>
                    <Input id="fMatricula" value={firmadoMatricula} onChange={(e) => setFirmadoMatricula(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Firma (dibujar con mouse o dedo)</Label>
                  <SignaturePad onChange={setFirmaDatos} />
                </div>
                <Button loading={saving} onClick={handleFirmar} className="self-start">Firmar informe</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
