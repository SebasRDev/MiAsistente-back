/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrinterService } from 'src/printer/printer.service';
import { formulaReport } from './documents/formula.report';
import FormulaReport from 'src/quotes/interfaces/formula.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from 'src/products/entities/product.entity';
import { Repository } from 'typeorm';
import { quoteReport } from 'src/quotes/documents/quote.report';
import { Kit } from 'src/kits/entities/kit.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { ImageOptimizerService } from 'src/common/services/image-optimizer.service';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  // Caché en memoria de imágenes ya optimizadas, indexada por URL original.
  // La misma imagen de kit se reutiliza entre muchas fórmulas; cachear el
  // resultado evita repetir la descarga por red y el trabajo de sharp.
  private static readonly imageCache = new Map<string, string>();
  private static readonly MAX_IMAGE_CACHE = 50;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    @InjectRepository(Kit)
    private readonly kitRepository: Repository<Kit>,

    private readonly printer: PrinterService,
    private readonly httpService: HttpService,
    private readonly imageOptimizer: ImageOptimizerService,
  ) {}

  private cacheImage(url: string, optimizedBase64: string): void {
    // Evicción simple FIFO para acotar la memoria de la caché.
    if (QuotesService.imageCache.size >= QuotesService.MAX_IMAGE_CACHE) {
      for (const oldestKey of QuotesService.imageCache.keys()) {
        QuotesService.imageCache.delete(oldestKey);
        break; // solo eliminamos el más antiguo (orden de inserción)
      }
    }
    QuotesService.imageCache.set(url, optimizedBase64);
  }

  async getReport(quoteData: FormulaReport, type: 'formula' | 'quote') {
    const { data, products, kit } = quoteData;

    const formulaProducts = await Promise.all(
      products.map(async (product) => {
        const productDB = await this.productsRepository.findOneBy({
          id: product.id,
        });
        if (!productDB)
          throw new NotFoundException(`Product ${product.id} not found`);
        return {
          ...productDB,
          quantity: product.quantity,
          discount: product.discount,
        };
      }),
    );

    // Only look for a kit if a kit ID is provided
    // Cargar el kit con sus relaciones para poder validar productos
    let formulaKit: Kit | null = null;
    if (kit) {
      formulaKit = await this.kitRepository.findOne({
        where: { id: kit },
        relations: ['kitProducts', 'kitProducts.product'],
      });
    }

    // Optimizar imagen del kit si existe
    if (formulaKit && formulaKit.imageLink) {
      const originalUrl = formulaKit.imageLink;
      const cached = QuotesService.imageCache.get(originalUrl);

      if (cached) {
        formulaKit.imageLink = cached;
        this.logger.log(
          `Using cached optimized image for kit ${formulaKit.id}`,
        );
      } else {
        this.logger.log(
          `Attempting to fetch and optimize image from: ${originalUrl}`,
        );
        try {
          const response: AxiosResponse<ArrayBuffer> = await firstValueFrom(
            this.httpService.get<ArrayBuffer>(originalUrl, {
              responseType: 'arraybuffer',
              timeout: 8000, // evita requests colgadas que retienen sockets
              maxContentLength: 10 * 1024 * 1024, // tope de 10MB
            }),
          );

          const buffer = Buffer.from(response.data);

          // Optimizar la imagen con sharp
          const optimizedBase64 =
            await this.imageOptimizer.optimizeProductImage(buffer);

          this.cacheImage(originalUrl, optimizedBase64);
          formulaKit.imageLink = optimizedBase64;
          this.logger.log(
            `Successfully fetched and optimized image for kit ${formulaKit.id}`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to fetch or optimize image from ${originalUrl}: ${errorMessage}`,
          );
          // La imagen permanecerá sin optimizar, el reporte se generará sin ella
        }
      }
    } else if (formulaKit && !formulaKit.imageLink) {
      this.logger.warn(`Kit ${formulaKit.id} found, but it has no imageLink.`);
    }

    let docDefinition: any;
    if (type === 'formula') {
      docDefinition = formulaReport(data, formulaProducts, formulaKit);
    }
    if (type === 'quote') {
      docDefinition = quoteReport(data, formulaProducts);
    }
    return this.printer.createPdf(docDefinition);
  }
}
