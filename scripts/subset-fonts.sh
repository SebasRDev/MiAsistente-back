#!/bin/bash

# Script para subsetear fuentes manteniendo caracteres en español
# Esto reduce dramáticamente el tamaño de las fuentes sin perderlas

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Font Subsetting Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar si fonttools está instalado
if ! command -v pyftsubset &> /dev/null; then
    echo -e "${YELLOW}fonttools no está instalado. Instalando...${NC}"
    pip3 install fonttools brotli
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Error instalando fonttools. Intenta manualmente:${NC}"
        echo "pip3 install fonttools brotli"
        exit 1
    fi
fi

# Crear directorio de backup
BACKUP_DIR="fonts/original-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}Creando backup de fuentes originales en: $BACKUP_DIR${NC}"
cp fonts/*.ttf fonts/*.otf "$BACKUP_DIR/" 2>/dev/null

# Caracteres a mantener (español + números + símbolos comunes)
# Incluye:
# - Letras básicas (a-z, A-Z)
# - Números (0-9)
# - Caracteres acentuados en español (á, é, í, ó, ú, ñ, ü)
# - Signos de puntuación y símbolos comunes
# - Símbolos de moneda ($, €)
UNICODE_RANGE="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+20AC"

# Texto de ejemplo con todos los caracteres usados en los PDFs
# Esto incluye todos los textos que aparecen en tus reportes
TEXT_SAMPLE="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áéíóúñüÁÉÍÓÚÑÜ.,;:!?¿¡()[]{}@#\$%&*+-=/_|\\\"'<>ÂâÊêÎîÔôÛûÀàÈèÌìÒòÙù MARCA REGISTRADA DE LA EMPRESA CODEMFAR SAS nit Cotización Nombre Identificación Contacto Ciudad Campaña Estimado asesor presenta la cotización continuación Productos uso en casa cabina cortesías por su compra son venta público genera una ganancia rentabilidad rendimiento promedio sesiones Total Sin Descuentos Ahorro a pagar Observaciones Esta válida hasta sujeta disponibilidad inventario Recomendación profesional especialista Skinhealth hace siguiente recomendación BENEFICIOS PARA TU PIEL PRODUCTOS TIPS PROTOCOLOS DIA NOCHE Activos Propiedades Precio Público Rendimiento Cant Dcto Línea SUBTOTAL TOTAL"

echo -e "${BLUE}Procesando fuentes...${NC}"
echo ""

# Función para procesar cada fuente
process_font() {
    local font_file=$1
    local font_name=$(basename "$font_file")
    local extension="${font_name##*.}"
    local temp_file="fonts/temp_${font_name}"

    echo -e "${YELLOW}Procesando: ${font_name}${NC}"

    # Obtener tamaño original
    original_size=$(du -h "$font_file" | cut -f1)

    # Subsetear la fuente manteniendo los caracteres especificados
    pyftsubset "$font_file" \
        --text="$TEXT_SAMPLE" \
        --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk' \
        --flavor="${extension}" \
        --output-file="$temp_file" \
        --no-hinting \
        --desubroutinize \
        --no-notdef-glyph

    if [ $? -eq 0 ]; then
        # Obtener tamaño nuevo
        new_size=$(du -h "$temp_file" | cut -f1)

        # Reemplazar original con subseteado
        mv "$temp_file" "$font_file"

        # Calcular reducción
        original_bytes=$(du -b "fonts/original-backup-$(ls -t fonts/ | grep original-backup | head -1)/$font_name" | cut -f1)
        new_bytes=$(du -b "$font_file" | cut -f1)
        reduction=$(( 100 - (new_bytes * 100 / original_bytes) ))

        echo -e "${GREEN}✓ Completado: ${original_size} → ${new_size} (${reduction}% reducción)${NC}"
    else
        echo -e "${YELLOW}✗ Error procesando ${font_name}${NC}"
        rm -f "$temp_file"
    fi

    echo ""
}

# Procesar todas las fuentes TTF
for font in fonts/*.ttf; do
    if [ -f "$font" ]; then
        process_font "$font"
    fi
done

# Procesar todas las fuentes OTF
for font in fonts/*.otf; do
    if [ -f "$font" ]; then
        process_font "$font"
    fi
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}¡Proceso completado!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Notas:${NC}"
echo "- Las fuentes originales están en: $BACKUP_DIR"
echo "- Las fuentes subseteadas mantienen TODOS los caracteres en español"
echo "- Puedes restaurar desde el backup si algo sale mal"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo "1. Reinicia tu aplicación"
echo "2. Genera un PDF de prueba"
echo "3. Verifica que todo el texto se vea correctamente"
echo "4. Si hay algún problema, restaura desde el backup"
echo ""
