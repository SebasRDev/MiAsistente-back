import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { Response } from 'express';
import Report from 'src/quotes/interfaces/formula.interface';

// Forma mínima del documento que devuelve pdfmake (PDFKit stream) que usamos aquí.
interface PdfKitDocument extends NodeJS.ReadableStream {
  info: Record<string, unknown>;
  end(): void;
}

@Controller('quotes')
export class QuotesController {
  private readonly logger = new Logger(QuotesController.name);

  constructor(private readonly quotesService: QuotesService) {}

  // Envía el documento al cliente liberando recursos si la conexión se corta
  // o si pdfmake falla a mitad del stream.
  private streamPdf(
    pdfDoc: PdfKitDocument,
    response: Response,
    title: string,
  ): void {
    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = title;

    pdfDoc.on('error', (err: Error) => {
      this.logger.error(`Error generating PDF: ${err.message}`);
      if (!response.headersSent) response.status(500).end();
      pdfDoc.end();
    });

    // Si el cliente aborta (cierra pestaña, timeout de proxy), liberamos el
    // documento para que no quede reteniendo buffers en memoria.
    response.on('close', () => pdfDoc.end());

    pdfDoc.pipe(response);
    pdfDoc.end();
  }

  @Post('formula')
  async getFormulaReport(@Body() params: Report, @Res() response: Response) {
    const { data } = params;
    const pdfDoc = (await this.quotesService.getReport(
      params,
      'formula',
    )) as unknown as PdfKitDocument;
    this.streamPdf(pdfDoc, response, `formula ${data?.name}`);
  }

  @Post('quote')
  async getQuoteReport(@Body() params: Report, @Res() response: Response) {
    const { data } = params;
    const pdfDoc = (await this.quotesService.getReport(
      params,
      'quote',
    )) as unknown as PdfKitDocument;
    this.streamPdf(pdfDoc, response, `Cotización ${data?.name}`);
  }
}
