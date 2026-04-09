# DiarIO — Registro diario de tu local

App web para registrar ventas, gastos y compras de un local, con dashboard analítico, exportación a CSV/Excel, y autenticación por Google. Multi-empresa y multi-usuario.

---

## Estructura de archivos

```
diario-app/
├── index.html
├── css/
│   └── main.css
├── js/
│   ├── firebase.js         ← Configuración Firebase
│   ├── auth.js             ← Login / logout con Google
│   ├── empresa.js          ← Crear empresa, unirse con código
│   ├── subcategorias.js    ← CRUD de subcategorías
│   ├── movimientos.js      ← CRUD de movimientos
│   ├── dashboard.js        ← Métricas y gráficas
│   ├── informes.js         ← Exportar CSV / Excel
│   ├── ui.js               ← Helpers: toasts, modales, formateo
│   └── router.js           ← Orquesta flujo y navegación
├── pages/
│   ├── dashboard.html
│   ├── registro.html
│   └── informes.html
└── firestore.rules
```

---

## Despliegue en GitHub Pages

### 1. Crear repositorio en GitHub
- Nuevo repositorio público, sin README inicial

### 2. Subir archivos
```bash
cd diario-app
git init
git add .
git commit -m "DiarIO v1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/diario-app.git
git push -u origin main
```

### 3. Activar GitHub Pages
- Settings → Pages → Source: `main` / `/ (root)` → Save
- URL: `https://TU_USUARIO.github.io/diario-app/`

---

## Configurar Firebase

### Google Sign-In
1. Firebase Console → Authentication → Sign-in method → Google → Habilitar
2. En "Authorized domains" agrega `TU_USUARIO.github.io`

### Reglas Firestore
1. Firebase Console → Firestore → Rules
2. Pega el contenido de `firestore.rules` → Publicar

### Índices Firestore
La primera vez que se ejecuten queries compuestas, Firebase mostrará un error
en la consola del navegador con un enlace directo para crear el índice.
Haz clic en ese enlace y Firebase lo crea automáticamente. Los índices que necesitas:

- `movimientos`: `claveMes` ASC + `fecha` DESC + `creadoEn` DESC
- `movimientos`: `claveMes` ASC + `fecha` ASC (para informes por rango)

### Restricción de API Key (recomendado)
1. console.cloud.google.com → APIs → Credenciales → tu API key
2. Restricciones de aplicación → Referentes HTTP
3. Agregar: `https://TU_USUARIO.github.io/*` y `http://localhost/*`

---

## Uso

### Primer acceso
1. Login con Google
2. Crear local (nombre → genera código) o unirse con código de otro admin
3. Compartir el código con otros usuarios de tu local

### Registrar
- Formulario superior en Registro → Enter o botón Agregar
- Subcategorías nuevas: seleccionar "+ Nueva subcategoría..."

### Exportar
- Informes → seleccionar rango → CSV o Excel (compatible con libro fiscal)

---

## Mejoras futuras pendientes
- Editar / eliminar movimientos
- Rol solo lectura para contadores
- Importar desde CSV
- Resumen automático por correo al cierre del mes
- Múltiples empresas por usuario
