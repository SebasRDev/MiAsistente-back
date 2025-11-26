import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

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
export class PrinterService {
  private printer = new PdfPrinter(fonts);

  createPdf(docDefinition: TDocumentDefinitions) {
    return this.printer.createPdfKitDocument(docDefinition);
  }
}
