# ConteoFast: instalación y migración de evidencias

## Cambios

- El catálogo de Alcaldía es común a ambas zonas: 3, 4, 6-8, 7, 18, 20, 21, 61 y 62. Se reutiliza el ID real de Juan Medina (lista 4) devuelto por el catálogo. No se insertan candidatos ficticios ni se modifican votos históricos. Concejales y vocales conservan sus reglas.
- Ambas tablas de evidencias dejan de guardar BLOB. La columna nueva `ruta_archivo` contiene una ruta relativa; se conservan nombre, MIME, tamaño, SHA-256, fechas y claves existentes.
- Las fotos nuevas siguen llegando como PNG binario por las mismas rutas HTTP. El almacenamiento verifica tamaño, MIME y SHA-256 antes de cerrar una dignidad. El acceso HTTP no expone rutas físicas ni publica una carpeta estática.
- Se conservan archivos sustituidos y archivos huérfanos de una operación fallida, de forma deliberada para no perder evidencias. No hay limpieza automática. Respaldar y revisar uso de disco periódicamente. No borrar archivos referenciados.
- Los endpoints antiguos de actualización/eliminación global no pueden modificar registros que ya tengan cierres por dignidad.

## 1. Preparar el servidor

En el servidor Linux, para Docker con el usuario `node` del Dockerfile (UID/GID 1000):

```sh
sudo install -d -o 1000 -g 1000 -m 0750 /home/administrador/apps/evidencias-conteofast
```

Si se usa Node/PM2 directamente como administrador, usar en cambio:

```sh
mkdir -p /home/administrador/apps/evidencias-conteofast
chmod 750 /home/administrador/apps/evidencias-conteofast
```

El API creará subdirectorios automáticamente al guardar cada evidencia. No colocar la carpeta en `public` ni exponerla con Nginx. Ejemplo de ruta relativa:

```
eleccion-1/recinto-12/junta-34/ALCALDE/registro-56/<sha256>.png
```

Los IDs son de la base de datos y el SHA-256 es el del archivo real. La carpeta es privada, y los archivos permanecen al reconstruir el contenedor si se monta el volumen.

## 2. Respaldo y preparación

1. Identificar el despliegue actual (`docker ps`, `docker compose config --services`, `pm2 list`, según corresponda). No se entregó el compose real ni la configuración del proxy.
2. Detener todas las instancias del API anterior y cualquier proceso que escriba evidencias. Mantener MySQL funcionando.
3. Hacer una copia completa verificable de la base de datos y conservar el código anterior. No usar `docker compose down -v`. Si se utiliza `mysqldump`, usar las credenciales actuales y `--single-transaction --hex-blob`; verificar el respaldo antes de continuar. Si se usa phpMyAdmin, exportar estructura y datos, incluidos BLOB.
4. Extraer el backend nuevo sobre una copia del proyecto actual, conservando el `.env` original y la configuración de despliegue. El ZIP no incluye contraseñas ni `node_modules` de Windows. Los paquetes se instalan con `npm ci` o al construir Docker.

## 3. Docker Compose (si es el método de despliegue)

En el servicio existente del backend, conservar su imagen/build, puertos, redes, configuración de DB, `env_file` y demás variables. Añadir a sus secciones existentes (no duplicarlas):

```yaml
environment:
  CF_EVIDENCIAS_DIR: /data/evidencias
volumes:
  - /home/administrador/apps/evidencias-conteofast:/data/evidencias
```

Desde el directorio donde se encuentra el compose, usar el nombre REAL del servicio backend (`docker compose config --services`). Ejemplo de comandos; sustituir `NOMBRE_SERVICIO`:

```sh
SERVICIO=NOMBRE_SERVICIO
docker compose stop "$SERVICIO"
docker compose build "$SERVICIO"
docker compose run --rm --no-deps --entrypoint node "$SERVICIO" scripts/migrar-evidencias.js
```

Este primer comando de migración conserva ambos BLOB. Si falla, no ejecutar el siguiente. Confirmar el número de fotos, revisar los directorios y hacer un respaldo adicional de la carpeta de evidencias (incluyendo sus permisos). Después, con el API todavía detenido:

```sh
docker compose run --rm --no-deps --entrypoint node "$SERVICIO" scripts/migrar-evidencias.js --eliminar-blobs
docker compose up -d "$SERVICIO"
docker compose logs --tail=100 "$SERVICIO"
```

El segundo paso verifica otra vez todos los archivos, convierte la ruta en NOT NULL y elimina las columnas `imagen` de ambas tablas. El DDL de MySQL no es una sola transacción entre tablas; si se interrumpe, mantener el API apagado y repetir el script. El script soporta tablas ya migradas. No volver al backend anterior sin restaurar un esquema compatible y coordinar los datos nuevos.

Si Docker se ejecuta sin Compose, aplicar el mismo bind mount con `-v /home/administrador/apps/evidencias-conteofast:/data/evidencias` al contenedor de migración y al definitivo, conservar las redes y variables originales y ejecutar el script en un contenedor temporal con la imagen nueva. No se conoce el comando docker run original.

## 4. Alternativa Node/PM2 (sin Docker)

Desde el directorio del backend, tras detener el API anterior y respaldar MySQL:

```sh
npm ci
export CF_EVIDENCIAS_DIR=/home/administrador/apps/evidencias-conteofast
npm run migrar:evidencias
# Verificar y respaldar los archivos antes del segundo paso.
npm run migrar:evidencias -- --eliminar-blobs
```

Añadir `CF_EVIDENCIAS_DIR=/home/administrador/apps/evidencias-conteofast` al `.env` original y reiniciar con el gestor existente. El API verifica permisos y esquema al iniciar. No ejecutar la aplicación sin la migración.

## 5. Frontend

El ZIP `src-conteofast-corregido.zip` contiene el árbol `src/` completo, igual que el original. Reemplazar `src/` en el proyecto Angular/Ionic original (respaldarlo primero), conservando `package.json`, `angular.json`, `tsconfig`, etc. Instalar dependencias del proyecto original si hace falta y construir con su comando habitual (`npm run build` o `npx ng build --configuration production`, según sus scripts). Publicar el resultado con el método habitual. No se suministraron esos archivos de configuración ni los del servidor de frontend, por lo que no se puede confirmar el directorio de salida ni compilar aquí el proyecto Angular completo. Se preservó la URL de producción del código original.

## 6. Verificaciones posteriores

En MySQL:

```sql
SHOW COLUMNS FROM cf_registro_evidencias;
SHOW COLUMNS FROM cf_registro_dignidad_evidencias;
SELECT registro_id, ruta_archivo, tamano_bytes, sha256 FROM cf_registro_evidencias LIMIT 10;
SELECT registro_id, tipo, ruta_archivo, tamano_bytes, sha256 FROM cf_registro_dignidad_evidencias LIMIT 10;
SELECT id, nombre, numero_lista, tipo, activo FROM cf_candidatos
WHERE tipo='ALCALDE' AND numero_lista='4';
```

Confirmar que Juan Medina está activo para la elección configurada; no insertar otro candidato con un ID inventado. Confirmar en una junta de prueba no finalizada que Alcalde presenta las nueve listas en ambas zonas y Concejal rural no muestra la lista 4. Guardar votos de prueba, subir fotografía, verificar la ruta y ver/descargar desde la API. Reiniciar el contenedor y volver a descargar. Probar que un cierre bloquea la modificación. No usar resultados reales como pruebas ni alterar actas cerradas. Las actas rurales ya cerradas con el catálogo anterior no se rellenan con ceros retroactivamente; cualquier corrección histórica requiere un procedimiento autorizado y contrastar actas.

El proxy inverso debe admitir el límite de carga (por ejemplo `client_max_body_size 32m;` en Nginx si corresponde). No cambiar CORS ni las URLs sin conocer el despliegue real.

## Seguridad y límites

El código original no aplica autenticación/autorización a estas rutas de registro y cierre. No se añadió una credencial improvisada ni se cambió el contrato del frontend. Mantener la API restringida a operadores autorizados y no desplegarla públicamente hasta incorporar autenticación y autorización verificadas. No confiar solo en CORS. Proteger también copias de seguridad y configuración. El sistema es de registro de datos, no certifica candidaturas oficiales.

Validación local: pruebas Node de almacenamiento y catálogo, sintaxis JS y transpilación TS. No hubo acceso al servidor ni al esquema MySQL real ni al proyecto Angular completo. Verificar en un entorno de pruebas antes de producción.
