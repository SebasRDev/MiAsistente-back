import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

// Configuración global de sharp (memoria nativa de libvips, fuera del heap de V8).
// Limita la caché y la concurrencia de threads para evitar crecimiento de memoria
// nativa bajo carga concurrente.
sharp.cache({ items: 20, memory: 50 });
sharp.concurrency(2);

@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);

  /**
   * Optimiza una imagen para usar en PDFs
   * @param buffer - Buffer de la imagen original
   * @param maxWidth - Ancho máximo (default: 1500px)
   * @param maxHeight - Alto máximo (default: 1500px)
   * @param quality - Calidad JPEG 1-100 (default: 95)
   * @returns Data URI base64 optimizado
   */
  async optimizeForPdf(
    buffer: Buffer,
    options?: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      format?: 'jpeg' | 'png';
    },
  ): Promise<string> {
    const {
      maxWidth = 1500,
      maxHeight = 1500,
      quality = 95,
      format = 'jpeg',
    } = options || {};

    try {
      const optimized = sharp(buffer).resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true, // No agranda si es más pequeña
      });

      let mimeType: string;
      let optimizedBuffer: Buffer;

      if (format === 'jpeg') {
        optimizedBuffer = await optimized
          .jpeg({
            quality,
            // mozjpeg disabled: its extra compression pass costs significant CPU
            // and the savings (~10%) are imperceptible inside a PDF binary stream.
            mozjpeg: false,
          })
          .toBuffer();
        mimeType = 'image/jpeg';
      } else {
        optimizedBuffer = await optimized
          .png({
            compressionLevel: 9,
          })
          .toBuffer();
        mimeType = 'image/png';
      }

      const originalSize = buffer.length;
      const optimizedSize = optimizedBuffer.length;
      const reduction = (
        ((originalSize - optimizedSize) / originalSize) *
        100
      ).toFixed(2);

      this.logger.log(
        `Image optimized: ${(originalSize / 1024).toFixed(2)}KB → ${(optimizedSize / 1024).toFixed(2)}KB (${reduction}% reduction)`,
      );

      return `data:${mimeType};base64,${optimizedBuffer.toString('base64')}`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to optimize image: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Optimiza imágenes de productos/kits con alta calidad
   * Configuración para evitar imágenes borrosas manteniendo optimización
   */
  async optimizeProductImage(buffer: Buffer): Promise<string> {
    // The kit image is rendered at width: 300pt in the PDF (A4 = 595.28pt).
    // 600px provides 2× resolution for print quality — anything larger adds
    // processing time without visible improvement in the final PDF.
    // mozjpeg is disabled here because its CPU overhead outweighs the marginal
    // compression gain for an image embedded in a binary PDF stream.
    return this.optimizeForPdf(buffer, {
      maxWidth: 600,
      maxHeight: 600,
      quality: 80,
      format: 'jpeg',
    });
  }
}
