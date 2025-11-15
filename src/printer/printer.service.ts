import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { promises as fs } from 'fs';
import { ImageOptimizerService } from 'src/common/services/image-optimizer.service';

const fonts = {
  Roboto: {
    normal: 'fonts/Roboto-Regular.ttf',
    bold: 'fonts/Roboto-Medium.ttf',
    italics: 'fonts/Roboto-Italic.ttf',
    bolditalics: 'fonts/Roboto-MediumItalic.ttf',
  },
  'Swiss-721': {
    normal: 'fonts/Swiss-721-Roman.ttf',
    bold: 'fonts/Swiss-721-Bold.ttf',
    italic: 'fonts/Swiss-721-Italic.otf',
    boldItalic: 'fonts/Swiss-721-Bold-Italic.otf',
  },
  'Trajan-Pro': {
    normal: 'fonts/Trajan-Pro.ttf',
    bold: 'fonts/TrajanPro-Bold.ttf',
  },
};

@Injectable()
export class PrinterService implements OnModuleInit {
  private readonly logger = new Logger(PrinterService.name);
  private printer = new PdfPrinter(fonts);
  private cachedLogo: string;

  constructor(private readonly imageOptimizer: ImageOptimizerService) {}

  async onModuleInit() {
    // Cargar y optimizar el logo una sola vez al inicio
    try {
      const logoBuffer = await fs.readFile('src/assets/logo_30_y.png');
      this.cachedLogo = await this.imageOptimizer.optimizeLogo(logoBuffer);
      this.logger.log('Logo optimizado y cacheado exitosamente');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al cargar el logo: ${errorMessage}`);
    }
  }

  getCachedLogo(): string {
    return this.cachedLogo;
  }

  createPdf(docDefinition: TDocumentDefinitions) {
    // PDFKit ya comprime automáticamente el contenido por defecto
    return this.printer.createPdfKitDocument(docDefinition);
  }
}
