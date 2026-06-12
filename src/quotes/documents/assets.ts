import * as fs from 'fs';
import * as path from 'path';

/**
 * Carga el logo una sola vez al iniciar el proceso y lo cachea como data URI.
 * Antes pdfmake leía el PNG de disco en CADA generación de PDF; ahora se hace
 * una única vez. Además falla de forma temprana y clara si la ruta no existe,
 * en lugar de fallar silenciosamente por cada request.
 */
const loadLogoBase64 = (): string => {
  const logoPath = path.join(process.cwd(), 'src/assets/logo_30_y.png');
  const buffer = fs.readFileSync(logoPath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
};

export const LOGO_BASE64 = loadLogoBase64();
