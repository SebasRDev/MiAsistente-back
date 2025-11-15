import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);

  /**
   * Optimiza una imagen para usar en PDFs
   * @param buffer - Buffer de la imagen original
   * @param maxWidth - Ancho máximo (default: 300px)
   * @param maxHeight - Alto máximo (default: 300px)
   * @param quality - Calidad JPEG 1-100 (default: 80)
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
      maxWidth = 300,
      maxHeight = 300,
      quality = 95,
      format = 'jpeg',
    } = options || {};

    try {
      let optimized = sharp(buffer).resize(maxWidth, maxHeight, {
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
            compressionLevel: 2,
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
   * Optimiza el logo de la compañía
   */
  async optimizeLogo(buffer: Buffer): Promise<string> {
    return this.optimizeForPdf(buffer, {
      maxWidth: 150,
      maxHeight: 150,
      quality: 85,
      format: 'png', // Los logos generalmente se ven mejor en PNG
    });
  }

  /**
   * Optimiza imágenes de productos/kits
   */
  async optimizeProductImage(buffer: Buffer): Promise<string> {
    return this.optimizeForPdf(buffer, {
      maxWidth: 400,
      maxHeight: 400,
      quality: 80,
      format: 'jpeg', // Las fotos de productos se ven bien en JPEG
    });
  }
}
