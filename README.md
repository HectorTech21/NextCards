# NextCards

Prototipo frontend para gestionar las tarjetas de visita digitales de los empleados de Lognext. La aplicación utiliza únicamente HTML, CSS y JavaScript moderno, y guarda los datos en `localStorage`.

## Ejecutar localmente

Los módulos JavaScript necesitan un servidor HTTP local. Desde esta carpeta:

```powershell
python -m http.server 8080
```

Después, abre `http://localhost:8080`.

También puedes usar cualquier servidor estático equivalente. No abras `index.html` directamente con `file://`, porque algunos navegadores bloquean los módulos ES y el acceso al portapapeles.

## Funciones incluidas

- Dashboard responsive con búsqueda y filtros.
- Dieciséis tarjetas iniciales generadas desde la carga autorizada.
- Crear, editar, duplicar, desactivar y eliminar tarjetas.
- Editor con validaciones, fotografía y vista previa en tiempo real.
- Gestor completo de plantillas con Corporate Navy, Clean Light y Meaningful Tech como diseños del sistema.
- Variantes personalizadas controladas, plantilla predeterminada, previsualización y aplicación individual o masiva.
- Estadísticas locales basadas en eventos, con filtros, comparativas, gráfico temporal SVG, ranking por tarjeta y detalle individual.
- Modos separados de actividad local real y demostración, exportación CSV/JSON y limpieza selectiva.
- Persistencia centralizada en `assets/js/storage.js`.
- Importación y exportación JSON.
- Vista pública mediante `card.html?id=slug`.
- Descarga de contactos en formato VCF.
- Web Share API con copia del enlace como alternativa.
- Código QR local para la URL pública, sin servicios externos.
- Restauración explícita de los datos iniciales.

El QR se genera en el navegador mediante la librería ligera `qrcode-generator`, incluida localmente en el proyecto bajo licencia MIT. La vista pública no depende de un servicio QR externo.

## Arquitectura

- `index.html`: dashboard y editor.
- `card.html`: tarjeta pública.
- `assets/css/variables.css`: tokens de marca y tipografía.
- `assets/css/global.css`: base, botones y plantillas compartidas.
- `assets/css/dashboard.css`: dashboard y navegación.
- `assets/css/editor.css`: formulario, modal y preview.
- `assets/css/templates.css`: catálogo, editor y aplicación masiva de plantillas.
- `assets/css/analytics.css`: dashboard de estadísticas, gráfico, ranking, distribuciones y panel de detalle.
- `assets/css/public-card.css`: experiencia pública.
- `assets/js/storage.js`: único acceso a `localStorage`.
- `assets/data/employees.json`: seed inicial versionado de empleados.
- `assets/js/cards.js`: reglas de negocio y CRUD.
- `assets/js/preview.js`: render seguro de las tarjetas.
- `assets/js/editor.js`: formulario, validación y estado del editor.
- `assets/js/templates-store.js`: catálogo persistente y reglas de negocio de plantillas.
- `assets/js/templates-ui.js`: sección Plantillas, modales y aplicación a tarjetas.
- `assets/js/analytics.js`: creación de sesiones anónimas e instrumentación tolerante a fallos.
- `assets/js/analytics-store.js`: repositorio local versionado de eventos, con un máximo de 10.000 registros.
- `assets/js/analytics-aggregate.js`: filtros, métricas, series temporales, ranking por `cardId` y exportación CSV.
- `assets/js/analytics-demo.js`: generador determinista de datos ficticios, aislados mediante `isDemo: true`.
- `assets/js/analytics-ui.js`: renderizado y comportamiento accesible de la sección Estadísticas.
- `assets/js/app.js`: dashboard, filtros y eventos.
- `assets/js/public-card.js`: VCF, compartir, copiar y QR.
- `assets/js/card-export.js`: generación comprobable de URLs públicas y VCF.
- `assets/js/qr-code.js`: generación comprobable del SVG de cada QR.
- `assets/js/vendor/qrcode-generator.js`: generador QR local de Kazuhiko Arase (MIT).
- `scripts/generate-initial-employees.mjs`: generador reproducible de datos e imágenes.
- `scripts/test-seed-persistence.mjs`: pruebas de inicialización, persistencia y variantes por cargo.
- `scripts/test-analytics.mjs`: pruebas de tracking, sesiones, fuentes, filtros, agregación, demo y limpieza.

Los contenidos introducidos por el usuario se insertan con `textContent` y atributos DOM, no como HTML. Las URLs se validan antes de guardar y los enlaces externos usan `noopener noreferrer`.

## Evolución a una versión multiusuario

La separación entre almacenamiento, reglas de negocio y vistas permite sustituir `storage.js` por un cliente API sin rehacer la interfaz. Una versión productiva debería incorporar:

1. Autenticación con Microsoft Entra ID.
2. Roles de administrador y editor.
3. API autenticada y base de datos.
4. Almacenamiento privado de fotografías con transformación de imágenes.
5. URLs públicas reales, revocables y protegidas frente a enumeración.
6. Historial de cambios, auditoría y recuperación.
7. Analítica con consentimiento y minimización de datos.
8. Importación sincronizada desde Microsoft 365.
9. Políticas de retención, derechos RGPD y registro de base jurídica.
10. CSP estricta, monitorización y una suite automatizada completa.

El modelo local actual puede mantenerse como contrato inicial de la API. Las funciones de `cardService` serían reemplazadas gradualmente por operaciones asíncronas y estados de carga/error.

## Analítica local

La versión actual registra únicamente eventos producidos en el navegador donde se abre la tarjeta. No es una analítica centralizada: una apertura realizada en otro móvil queda en el almacenamiento de ese móvil y no puede aparecer en el dashboard del equipo. Para disponer de datos multiusuario debe sustituirse `LocalAnalyticsRepository` por un futuro `ApiAnalyticsRepository`, manteniendo separados tracking, almacenamiento, agregación y renderizado. Esa API deberá incorporar autenticación, control de acceso, deduplicación y protección contra spam, políticas de retención y requisitos de privacidad.

Los eventos admitidos son `card_view`, `qr_open`, `phone_click`, `email_click`, `linkedin_click`, `website_click`, `vcard_download`, `share_click`, `copy_link`, `qr_download`, `background_download` y `wallet_click`. Los tres últimos forman parte del contrato para funcionalidades futuras; solo se registran cuando exista una acción real asociada. El evento no incluye IP, geolocalización, email del visitante, user agent completo ni fingerprinting.

Las claves son:

- `nextcards_analytics_events` en `localStorage`: colección de eventos.
- `nextcards_analytics_schema_version` en `localStorage`: versión del esquema, actualmente `1`.
- `nextcards_analytics_session_id` en `sessionStorage`: sesión anónima aproximada por pestaña o sesión de navegador.

El repositorio conserva como máximo 10.000 eventos. Si se supera el límite descarta primero los más antiguos, mantiene los recientes y muestra una advertencia de capacidad. La acción “Limpiar analítica local” elimina exclusivamente las dos claves de `localStorage` anteriores; no usa `localStorage.clear()` y no modifica tarjetas, plantillas ni configuración.

La URL pública canónica se mantiene como `card.html?id=slug`. Los enlaces generados añaden un parámetro `source` controlado:

- El QR usa `source=qr`; solo al abrir esa URL se registran `card_view` y `qr_open`.
- Compartir usa `source=shared_link` y copiar usa `source=copied_link`.
- “Ver tarjeta” desde el dashboard usa `source=admin_preview` y la salida del editor usa `source=editor_preview`.
- Los previews quedan almacenados para depuración, pero están excluidos de todas las métricas principales salvo que se seleccione explícitamente el filtro de previews.
- Los enlaces antiguos sin `source` siguen funcionando y se clasifican como acceso directo.

El selector “Origen de datos” nunca mezcla silenciosamente la actividad local real con la demostración. “Cargar datos de demostración” genera una muestra reproducible de 90 días sobre las tarjetas existentes; volver a cargarla la sustituye, sin duplicarla. “Eliminar datos de demostración” conserva todos los eventos reales. Las exportaciones CSV y JSON respetan los filtros activos y se generan como descargas del navegador, sin escribir archivos en el proyecto.

Para borrar manualmente solo la analítica y empezar también una nueva sesión anónima, ejecuta en la consola del navegador:

```javascript
localStorage.removeItem("nextcards_analytics_events"); localStorage.removeItem("nextcards_analytics_schema_version"); sessionStorage.removeItem("nextcards_analytics_session_id"); location.reload();
```

## Datos iniciales y persistencia

El seed se carga una sola vez desde `assets/data/employees.json`. Las claves utilizadas son:

- `nextcards.cards.v1`: colección editable de tarjetas.
- `nextcards.seed.version`: versión aplicada del seed; actualmente `1`.
- `nextcards.templates.v1`: catálogo editable de plantillas.
- `nextcards.templates.seed.version`: versión aplicada del catálogo; actualmente `1`.

Las recargas no vuelven a insertar el seed. Las ediciones, eliminaciones, nuevas tarjetas, cambios de estado y cambios de plantilla permanecen en `localStorage`. La migración inicial elimina únicamente las tres tarjetas demo cuando coinciden exactamente con sus firmas originales; cualquier tarjeta modificada o creada manualmente se conserva.

Para reinicializar únicamente NextCards desde la consola del navegador:

```javascript
localStorage.removeItem("nextcards.cards.v1"); localStorage.removeItem("nextcards.seed.version"); localStorage.removeItem("nextcards.templates.v1"); localStorage.removeItem("nextcards.templates.seed.version"); location.reload();
```

## Regenerar la carga inicial

El Excel de entrada no forma parte del repositorio y está excluido mediante `.gitignore`. Instala primero las dependencias de desarrollo:

```powershell
pnpm install
```

Ejecuta siempre primero el dry-run:

```powershell
node .\scripts\generate-initial-employees.mjs `
  --excel "..\carga_inicial.xlsx" `
  --dry-run
```

Si no hay errores bloqueantes, genera el seed y las fotografías optimizadas:

```powershell
node .\scripts\generate-initial-employees.mjs `
  --excel "..\carga_inicial.xlsx"
```

El generador acepta variantes válidas de una persona cuando el cargo es distinto. En esos casos crea ID, `cardName` y slug independientes, y reutiliza la misma fotografía física cuando la ruta de origen coincide. No existe ninguna función de importación de Excel en la interfaz.

Para ejecutar las pruebas de persistencia:

```powershell
pnpm test:seed
```

Para validar el gestor de plantillas o toda la suite:

```powershell
pnpm test:templates
pnpm test:analytics
pnpm test
```
