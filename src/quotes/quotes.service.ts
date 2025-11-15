/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    @InjectRepository(Kit)
    private readonly kitRepository: Repository<Kit>,

    private readonly printer: PrinterService,
    private readonly httpService: HttpService,
    private readonly imageOptimizer: ImageOptimizerService,
  ) {}

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
    let formulaKit: Kit | null = null;
    if (kit) {
      formulaKit = await this.kitRepository.findOneBy({ id: kit });
    }

    // Optimizar imagen del kit si existe
    if (formulaKit && formulaKit.imageLink) {
      this.logger.log(
        `Attempting to fetch and optimize image from: ${formulaKit.imageLink}`,
      );
      try {
        const response: AxiosResponse<ArrayBuffer> = await firstValueFrom(
          this.httpService.get<ArrayBuffer>(formulaKit.imageLink, {
            responseType: 'arraybuffer',
          }),
        );

        const buffer = Buffer.from(response.data);

        // Optimizar la imagen con sharp
        const optimizedBase64 =
          await this.imageOptimizer.optimizeProductImage(buffer);

        formulaKit.imageLink = optimizedBase64;
        this.logger.log(
          `Successfully fetched and optimized image for kit ${formulaKit.id}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to fetch or optimize image from ${formulaKit.imageLink}: ${errorMessage}`,
        );
        // La imagen permanecerá sin optimizar, el reporte se generará sin ella
      }
    } else if (formulaKit && !formulaKit.imageLink) {
      this.logger.warn(`Kit ${formulaKit.id} found, but it has no imageLink.`);
    }

    // Obtener el logo optimizado del printer
    const optimizedLogo = this.printer.getCachedLogo();

    let docDefinition: any;
    if (type === 'formula') {
      docDefinition = formulaReport(
        data,
        formulaProducts,
        formulaKit,
        optimizedLogo,
      );
    }
    if (type === 'quote') {
      docDefinition = quoteReport(data, formulaProducts, optimizedLogo);
    }
    return this.printer.createPdf(docDefinition);
  }
}
