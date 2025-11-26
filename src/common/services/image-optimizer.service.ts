import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

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
            progressive: true,
            mozjpeg: true, // Usa mozjpeg para mejor compresión
          })
          .toBuffer();
        mimeType = 'image/jpeg';
      } else {
        optimizedBuffer = await optimized
          .png({
            compressionLevel: 9,
            progressive: true,
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
    return this.optimizeForPdf(buffer, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 92,
      format: 'jpeg', // Las fotos de productos se ven bien en JPEG
    });
  }
}
