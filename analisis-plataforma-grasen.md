# Análisis de plataforma GRASEN (ocpp.grasencharger.com) — funciones a incorporar en CSMS

**Fecha:** 2026-08-26
**Método:** exploración autenticada (Playwright) de las 22 páginas del dashboard, con cuenta demo (`wangtan`). La cuenta demo no tenía cargadores reales vinculados, así que las tablas aparecen vacías — el análisis se basa en la estructura real de la UI (columnas, tabs, campos de formulario, botones), no en datos de ejemplo.

**Contexto:** GRASEN es un CSMS profesional completo (23 ubicaciones, 199 estaciones, 353 conectores en su instancia productiva, según el dashboard de inicio). Sirve como referencia de features maduras de un producto comercial del mismo rubro que el nuestro.

---

## 1. Mapa completo de funciones (por sección de menú)

### Home
Dashboard con KPIs en vivo: ingreso del día, kWh del día, sesiones del día, cantidad de ubicaciones/estaciones/conectores, potencia total contratada, gráfico de tendencia de consumo (diario/semanal/mensual), donut charts de estado de estación y de conector, gráfico de potencia en tiempo real (últimas 24h), feed de fallas en tiempo real (serial, ubicación, conector, código de error, hora).

### Monitoring
- **Charging** — monitor en vivo de sesiones de carga activas, buscable por número de serie.
- **Station Status** — listado de estaciones con filtro por estado: Available / Unavailable / Faulted / Offline / All.
- **Location Status** — vista agregada por ubicación: potencia total/actual, ratio de uso, cantidad de estaciones/conectores por sitio.
- **Real-time Alarm** — feed histórico de alarmas con dos vistas (tabs "Station" / "Module Fault"): estación, ubicación, conector, código de error, info de falla, hora, estado.

### Users
- **RFID Card** — gestión de tarjetas: número de tarjeta, **Block No.** (estructura Mifare por bloques), balance, usuario, teléfono, email, operador, estado.
- **Users** — cuenta, teléfono, email, **tipo de usuario**, balance de tarjeta, balance de saldo móvil, fecha de registro, estado.
- **User Group** — grupos de usuarios (nombre, descripción, miembros, operador) — permite agrupar usuarios para permisos/tarifas diferenciadas.
- **Vehicle** — vehículos asociados a usuarios: patente, **VIN**, alias, marca, modelo.

### Financial
- **Statistic Analysis** — analítica con 5 tabs: Data Summary, por ubicación, por estación, por utilización, por usuario. Métricas: kWh, cantidad de cargas, ingreso total, **reducción de emisiones de CO2 (kg)**.
- **Price Setting** — configuración de tarifa eléctrica (por ubicación).
- **Recharge Record** — historial de recargas de saldo prepago: cuenta, TxID, monto, tipo, origen (fuente de pago), operador, hora.
- **Charging Record** — historial de sesiones de carga con costo: TxID, estación, conector, cuenta, tiempo, kWh, costo, estado.

### Assets
- **Location** — jerarquía de sitios/ubicaciones (nivel superior a las estaciones).
- **Stations** — inventario de equipos: número de serie, ubicación, alias, **tipo de equipo**, potencia nominal (kW), cantidad de conectores, **versión de software**.

### Maintenance
- **Reservations** — dos tabs: "Platform Reservation" (reserva hecha desde el panel admin) y "App Reservation" (reserva hecha por el usuario final desde su app). Mapea directo a OCPP `ReserveNow`/`CancelReservation`.
- **Diagnosis** — solicitud remota de diagnóstico al equipo (serie, hora inicio/fin, estado, nombre de archivo). Mapea a OCPP `GetDiagnostics`/`GetLog`.
- **Update Firmware** — actualización remota de firmware OTA: serie, versión de software, fecha de consulta, estado, hora de reporte. Mapea a OCPP `UpdateFirmware`/`PublishFirmware`.
- **Smart Charging** — **4 tabs**: **Load Balancing**, **Central System Smart Charging**, **Local Smart Charging**, **Timed Charging**. Ver sección 2 (comparación directa con nuestro DLB).
- **OCPP Log** — log crudo de mensajes OCPP intercambiados (acción, contenido, hora) por equipo — auditoría/debug visible al usuario, sin tener que ir a la base de datos.
- **Configuration** — editor remoto de `GetConfiguration`/`ChangeConfiguration` (u OCPP 2.0.1 `GetVariables`/`SetVariables`) organizado en tabs: **Station** (datos del equipo, red, software, control de AC/ventilador, switches HW, LCD, teclas propietarias GRASEN) y **OCPP** (Core, Reservation, Smart Charging, Authorize, Stop Charging). Ver detalle en sección 3.

### System
- **System User** — usuarios del panel admin (no confundir con Users, que son los conductores/clientes finales): cuenta, teléfono, email, operador, **rol**, último login, estado.
- **Permission** — gestión de roles con permisos (RBAC real, no solo roles fijos).

---

## 2. Smart Charging / balanceo — comparación directa con lo que ya construimos

Esto es lo más relevante porque coincide exactamente con el trabajo reciente en `listener/index.js` (`rebalanceGroup`) y con las pruebas de esta semana contra el wallbox `st888` (que rechazó Smart Charging por no tener `SmartChargingCtrlr` implementado).

GRASEN separa el concepto en **4 modos**, mientras que nuestro sistema solo implementa uno:

| Tab GRASEN | Qué es | Estado en nuestro CSMS |
|---|---|---|
| **Load Balancing** | Reparto dinámico de amperios entre sesiones activas de un grupo, con límite proveniente de medidor físico o límite contratado | Ya implementado (`rebalanceGroup`, medidor Modbus, cola FIFO) |
| **Central System Smart Charging** | Perfiles de carga enviados por el CSMS vía `SetChargingProfile` (server-driven) | Parcialmente — usamos `ChargingStationMaxProfile`; falta soporte explícito de `TxDefaultProfile`/`TxProfile` como perfiles independientes con su propio ciclo de vida en UI |
| **Local Smart Charging** | Reglas que corren *en el propio equipo* sin depender de conexión al servidor (fail-safe si se cae la red) | No implementado. Relevante para el mismo caso que ya documentamos: "si internet cae, cargas no arrancan por seguridad" — un perfil local en el equipo permitiría seguir limitando potencia aunque el servidor esté offline |
| **Timed Charging** | Programación horaria (ej. cargar solo en horario nocturno/valle) | No implementado. Coincide con "tarifa nocturna" ya mencionada como feature planeada en el proyecto |

**Dato duro que confirma nuestra investigación:** la vista de Smart Charging de GRASEN también depende 100% de que el equipo soporte realmente `SetChargingProfile` — es una capa de UI sobre el mismo mecanismo OCPP que probamos manualmente esta semana. No resuelve la limitación de firmware que encontramos en `st888`; solo la hace más visible/gestionable.

---

## 3. Configuration — el hallazgo más grande para nuestro roadmap

La pantalla de Configuration es un editor remoto en vivo de las claves de configuración OCPP estándar (`GetConfiguration`/`ChangeConfiguration` en 1.6, equivalente a `GetVariables`/`SetVariables` en 2.0.1 — ambos ya expuestos por CitrineOS en nuestro propio stack, confirmados esta semana: `/ocpp/2.0.1/monitoring/getVariables` y `setVariables`).

Claves visibles (todas estándar OCPP, ninguna inventada):
`NumberOfConnectors`, `UnlockConnectorOnEVSideDisconnect`, `GetConfigurationMaxKeys`, `MeterValuesAlignedData(+MaxLength)`, `MeterValuesSampledData(+MaxLength)`, `StopTxnAlignedData(+MaxLength)`, `StopTxnSampledData(+MaxLength)`, `SupportedFeatureProfiles(+MaxLength)`, `AuthorizeRemoteTxRequests`, `TransactionMessageAttempts`, `ConnectionTimeOut`, `ClockAlignedDataInterval`, `HeartbeatInterval`, `WebSocketPingInterval`, `MeterValueSampleInterval`, `TransactionMessageRetryInterval`, `BlinkRepeat`, `ResetRetries`, `SupportedFileTransferProtocols`, `MinimumStatusDuration`, `ConnectorPhaseRotation(+MaxLength)`.

Más un tab "Station" con configuración de bajo nivel específica de fabricante: seguridad WebSocket (`ws` / `ws+Basic` / `wss+HttpBasic` / `wss+ClientCert` — Security Profiles 0-3 del OCPP Security Whitepaper), red (DHCP/IP estática/gateway/DNS, 4G), sincronización de hora (NTP/Heartbeat), límites de corriente **por conector individual** (A/B/C/D), límite de corriente del cargador completo, límites de sobre/bajo voltaje, control de temperatura (fan/heater con umbrales configurables), habilitación de RFID y de VIN, y **4 slots de QR** (`QR0`-`QR3`) — sugiere que el equipo puede mostrar/rotar distintos códigos QR físicos, probablemente para distinguir conectores en un mismo poste.

**Por qué esto importa para nosotros:** hoy no tenemos ninguna pantalla de configuración remota — cualquier cambio de parámetro OCPP en un cargador requiere tocar la DB o el código a mano. Esto es una feature completa faltante, no un ajuste menor, y CitrineOS ya expone el endpoint necesario.

---

## 4. Gaps concretos respecto a nuestro sistema actual

| Feature GRASEN | Existe en CSMS hoy | Notas |
|---|---|---|
| Firmware update remoto | No | CitrineOS expone `updateFirmware`/`publishFirmware` (2.0.1) — falta solo la UI + tracking de estado |
| Reservas (`ReserveNow`) | No | CitrineOS expone `reserveNow`/`cancelReservation` — feature de negocio real ("courtesy garage reservation" ya está en el roadmap del proyecto, esto es la pieza técnica que falta) |
| Diagnóstico remoto (`GetLog`/`GetDiagnostics`) | No | Útil para soporte técnico sin acceso físico al equipo |
| Editor de configuración OCPP remoto | No | Ver sección 3 — el gap más grande encontrado |
| Log de mensajes OCPP visible en UI | Parcial | Nosotros lo hicimos manualmente por SQL esta semana (`OCPPMessages`); falta exponerlo como pantalla |
| Smart Charging con 4 modos separados | Parcial | Solo tenemos Load Balancing |
| RFID con balance prepago (wallet) | No | Hoy `tarjetas_rfid` es solo control de acceso, sin saldo asociado |
| Vehículos (VIN) por usuario | No | Sin tabla de vehículos hoy |
| Grupos de usuarios | No | Sin agrupación, solo `unidades_funcionales` por consorcio |
| Roles y permisos granulares (RBAC) | No | Hoy los roles son fijos en código (`admin`/`residente`/`superadmin`/etc.), no configurables desde UI |
| Analítica financiera multi-corte (por ubicación/estación/usuario/utilización) | Parcial | Tenemos liquidación por sesión, pero no dashboards de analítica agregada como este |
| CO2 ahorrado como métrica | No | Simple de agregar (factor de emisión de red × kWh) |
| Alarmas históricas separadas de estado en vivo | Parcial | Tenemos `ultimo_error` en `medidores_modbus`/`cargador_estado_actual`, no una tabla de historial de alarmas dedicada |
| Multi-tenant Location → Stations (jerarquía de sitios) | Parcial | Nuestro equivalente es `consorcio` → `sector` → `cargador`, conceptualmente similar |
| Estados de conector granulares (Available/Unavailable/Faulted/Offline) | Parcial | Tenemos estado OCPP crudo, falta la capa de filtro/resumen en UI |

---

## 5. Recomendación priorizada

**Nivel 1 — bajo esfuerzo, ya tenemos la pieza técnica (CitrineOS ya expone el endpoint):**
1. **Editor de Configuration remota** — usa `getVariables`/`setVariables` (2.0.1) o el equivalente 1.6, ya confirmado funcionando en nuestras pruebas de esta semana. Un formulario simple sobre esos endpoints.
2. **OCPP Log visible en UI** — ya hacemos la consulta a `OCPPMessages` manualmente; solo falta una pantalla en el admin que la muestre paginada.
3. **CO2 ahorrado** — cálculo derivado de kWh ya almacenados, sin nueva integración OCPP.
4. **Estados de conector con filtro (Available/Unavailable/Faulted/Offline)** — es una vista sobre datos que ya tenemos.

**Nivel 2 — esfuerzo medio, feature de negocio ya en el roadmap del proyecto:**
5. **Reservations (`ReserveNow`)** — coincide con "courtesy garage reservation" ya mencionado como objetivo del producto.
6. **Timed Charging (tarifa nocturna)** — coincide con "off-peak night rates" ya mencionado como objetivo del producto.
7. **RFID con balance prepago** — extiende `tarjetas_rfid` con una tabla de wallet/recargas.
8. **Tabla de alarmas históricas dedicada** — separar el feed en vivo del historial persistente.

**Nivel 3 — esfuerzo alto, features nuevas de plataforma:**
9. **Firmware update remoto** — requiere manejo de archivos de firmware + tracking de estado por dispositivo.
10. **Diagnóstico remoto (`GetLog`)** — requiere almacenamiento de archivos subidos por el equipo.
11. **RBAC configurable** (roles/permisos desde UI) — hoy es cambio de código; pasar a modelo de datos.
12. **Smart Charging con los 4 modos separados** — depende de que el hardware realmente lo soporte (limitación real encontrada esta semana con `st888`, no es solo trabajo nuestro).
13. **Vehículos por usuario (VIN)** — nueva tabla + UI, bajo impacto inmediato salvo que se pida reportes por vehículo.

---

## 6. Nota metodológica

- Login bloqueado por CAPTCHA (política: no se resuelven CAPTCHAs de forma automática) — se resolvió con el usuario completando el captcha una vez en un navegador visible, sesión reutilizada después vía `storageState` de Playwright.
- Las 22 páginas se visitaron con extracción de texto estructurado (headings, headers de tabla, botones, tabs, labels) en vez de screenshot completo en todas, para minimizar tokens; se tomó screenshot completo solo en las páginas con mayor densidad de información (Smart Charging, Configuration, Price Setting, Charging, Stations, Reservations, Diagnosis, Update Firmware, OCPP Log, Real-time Alarm).
- Cuenta demo sin cargadores reales vinculados — todas las tablas de datos aparecen vacías; el análisis de profundidad funcional viene de la estructura de columnas/campos/tabs, no de datos de ejemplo.
