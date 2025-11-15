# Optimización de Fuentes para PDFs

Este script reduce el tamaño de las fuentes personalizadas sin perderlas, manteniendo todos los caracteres necesarios para español.

## ¿Por qué optimizar las fuentes?

Las fuentes originales contienen miles de caracteres (letras chinas, japonesas, símbolos especiales, etc.) que nunca usas en tus PDFs. El subsetting mantiene **solo los caracteres que realmente necesitas**.

**Reducción esperada**: 60-80% del tamaño original

## Prerequisitos

El script requiere Python 3 y fonttools:

```bash
# Instalar fonttools (el script lo hace automáticamente, pero puedes hacerlo manualmente)
pip3 install fonttools brotli
```

## Uso

```bash
# Ejecutar el script de subsetting
./scripts/subset-fonts.sh

# O desde npm
npm run optimize:fonts
```

## ¿Qué hace el script?

1. ✅ Crea un backup automático de tus fuentes originales
2. ✅ Subsettea cada fuente manteniendo solo:
   - Letras (A-Z, a-z)
   - Números (0-9)
   - Caracteres acentuados (á, é, í, ó, ú, ñ, ü, etc.)
   - Signos de puntuación (. , ; : ! ? ¿ ¡)
   - Símbolos comunes (@, #, $, %, &, etc.)
   - Todos los textos que aparecen en tus reportes
3. ✅ Reduce el tamaño manteniendo la calidad visual
4. ✅ Reporta la reducción de tamaño por fuente

## Ejemplo de salida

```
Procesando: Roboto-Regular.ttf
✓ Completado: 168K → 45K (73% reducción)

Procesando: Swiss-721-Roman.ttf
✓ Completado: 26K → 12K (54% reducción)
```

## Restaurar fuentes originales

Si necesitas restaurar las fuentes originales:

```bash
# Las fuentes originales están en fonts/original-backup-FECHA/
cp fonts/original-backup-*/\*.ttf fonts/
cp fonts/original-backup-*/\*.otf fonts/
```

## Verificación

Después de ejecutar el script:

1. Reinicia tu aplicación
2. Genera un PDF de prueba
3. Verifica que todo el texto se vea correctamente
4. Si hay caracteres faltantes, restaura el backup y repórtalo

## Caracteres incluidos

El script mantiene estos caracteres:
- Alfabeto básico: A-Z, a-z
- Números: 0-9
- Acentos españoles: á, é, í, ó, ú, ü, ñ
- Mayúsculas con acentos: Á, É, Í, Ó, Ú, Ü, Ñ
- Signos de puntuación comunes
- Símbolos de moneda: $, €
- Guiones y rayas: -, –, —
- Comillas: ", ", ', '
- Paréntesis y corchetes: ( ) [ ] { }
- Todos los textos específicos de tus PDFs

Si necesitas caracteres adicionales, edita la variable `TEXT_SAMPLE` en el script.
