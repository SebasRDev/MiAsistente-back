import { TDocumentDefinitions } from 'pdfmake/interfaces';
import Product from 'src/products/interfaces/product.interface';
import { tableCabineReport } from 'src/quotes/documents/tableCabine.report';
import { Data } from 'src/quotes/interfaces/formula.interface';
import {
  calculateQuoteTotals,
  currencyFormatter,
  formatDate,
} from 'src/quotes/utils/utils';

export const quoteReport = (
  quoteInfo: Data,
  quoteProducts: Product[],
): TDocumentDefinitions => {
  const today = new Date();
  const formatedDate = formatDate(today);

  const { name, consultant, gift, phone, id, city, campaign, recommendations } =
    quoteInfo;

  const homeProducts = quoteProducts.filter(
    (product) => product.efficiency === null && product.publicPrice !== null,
  );

  const cabineProducts = quoteProducts.filter(
    (product) =>
      product.publicPrice === null && product.profesionalPrice !== null,
  );

  const { totalHome, profitability, totalCabine } = calculateQuoteTotals(
    quoteProducts,
    Number(quoteInfo.generalDiscount),
  );

  const hasAnyDiscount =
    quoteProducts.some((product) => product.discount) ||
    (quoteInfo.generalDiscount !== undefined &&
      Number(quoteInfo.generalDiscount) > 0);

  // Preparar el cuerpo de la tabla con validaciones para evitar errores
  const tableBody: Array<
    Array<{
      text: string;
      style: string;
      alignment?: string;
      pageBreak?: string;
    }>
  > = [];

  // Solo agregar filas de descuento si realmente hay descuentos
  if (hasAnyDiscount) {
    tableBody.push([
      {
        text: 'Total Sin Descuentos:',
        style: 'tableHeader',
        alignment: 'right',
      },
      {
        text: currencyFormatter.format(
          totalHome.totalNoDiscount + totalCabine.totalNoDiscount,
        ),
        style: 'tableHeaderRight',
      },
    ]);

    tableBody.push([
      { text: 'Ahorro Total:', style: 'tableHeader', alignment: 'right' },
      {
        text: currencyFormatter.format(
          totalHome.totalNoDiscount +
            totalCabine.totalNoDiscount -
            (totalHome.totalToPay + totalCabine.totalToPay),
        ),
        style: 'tableHeaderRight',
      },
    ]);
  }

  // Siempre agregar el total a pagar
  tableBody.push([
    { text: 'Total a pagar:', style: 'tableHeader', alignment: 'right' },
    {
      text: currencyFormatter.format(
        totalHome.totalToPay + totalCabine.totalToPay,
      ),
      style: 'tableHeaderRight',
    },
  ]);

  return {
    pageMargins: [40, 150, 40, 40],
    background: function () {
      return {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: 595.28,
            h: 841.89,
            color: '#eeede7',
          },
        ],
      };
    },
    header: {
      margin: [20, 10],
      columns: [
        {
          height: 150,
          width: 150,
          image: 'src/assets/logo_30_y.png',
        },
        {
          text: 'MARCA REGISTRADA DE LA\n EMPRESA CODEMFAR SAS\n nit 800233452-8',
          style: 'watermark',
        },
      ],
    },
    content: [
      { text: 'Cotización', style: 'title' },
      {
        text: `Nombre: ${name}\n
              Identificación: ${phone}\n
              Contacto: ${id}\n
              Ciudad: ${city || ''}\n
              Campaña: ${campaign || ''}\n`,
        style: 'body',
      },
      {
        text: `Estimado/a ${name} el asesor ${consultant} presenta la cotización a continuación`,
        style: 'body',
      },
      {
        text: homeProducts.length > 0 ? 'Productos uso en casa:' : '',
        style: 'heading',
      },
      homeProducts.length > 0
        ? tableCabineReport(
            homeProducts,
            quoteInfo.generalDiscount,
            'publicPrice',
          )
        : '',
      {
        text: cabineProducts.length > 0 ? 'Productos uso en cabina:' : '',
        style: 'heading',
      },
      cabineProducts.length > 0
        ? tableCabineReport(cabineProducts, quoteInfo.generalDiscount)
        : '',
      {
        text: gift ? `Las cortesías por su compra son: ${gift}` : '',
        style: 'body',
        margin: [0, 20],
      },
      {
        text:
          homeProducts.length > 0
            ? `En los productos de USO EN CASA el total de venta a público es ${currencyFormatter.format(totalHome.totalPublic)}, lo cual genera una ganancia de ${currencyFormatter.format(totalHome.totalPublic - totalHome.totalToPay)} y una rentabilidad de ${profitability.toFixed(2)}%`
            : '',
        style: 'body',
        margin: [0, 20],
      },
      {
        text:
          cabineProducts.length > 0
            ? `En los productos de USO EN CABINA el rendimiento promedio es de ${totalCabine.averageEfficiency.toFixed(0)} sesiones`
            : '',
        style: 'body',
        margin: [0, 20],
      },
      {
        unbreakable: true,
        layout: 'noBorders',
        table: {
          widths: ['*', 100],
          headerRows: 1,
          body: tableBody,
        },
      },
      {
        text: recommendations
          ? `Observaciones: 
            ${recommendations}`
          : '',
        style: 'body',
      },
    ],
    footer: function () {
      return [
        {
          canvas: [
            {
              type: 'line',
              x1: 40,
              y1: -20,
              x2: 595 - 40,
              y2: -20,
              lineWidth: 1,
              lineColor: '#b1b1b1',
            },
          ],
        },
        {
          text: `Esta cotización es valida hasta ${formatedDate}\n y esta sujeta a disponibilidad de inventario`,
          style: 'footer',
        },
      ];
    },
    styles: {
      watermark: {
        fontSize: 10,
        bold: true,
        font: 'Trajan-Pro',
        alignment: 'right',
        color: '#c7bfbf',
      },
      header: {
        fontSize: 20,
        bold: true,
        font: 'Swiss-721',
      },
      title: {
        fontSize: 12,
        bold: true,
        font: 'Trajan-Pro',
        alignment: 'center',
        color: '#4b4b4b',
      },
      heading: {
        fontSize: 12,
        bold: true,
        font: 'Trajan-Pro',
        alignment: 'left',
        color: '#4b4b4b',
        margin: [0, 15],
      },
      body: {
        fontSize: 12,
        font: 'Swiss-721',
        color: '#4b4b4b',
        margin: [0, 15],
      },
      tableHeader: {
        bold: true,
        font: 'Swiss-721',
        color: '#4b4b4b',
        fontSize: 12,
        alignment: 'center',
      },
      tableHeaderRight: {
        bold: true,
        font: 'Swiss-721',
        color: '#4b4b4b',
        fontSize: 12,
        alignment: 'right',
      },
      cell: {
        fontSize: 12,
        font: 'Swiss-721',
        color: '#4b4b4b',
        alignment: 'center',
        margin: [0, 5],
      },
      lastCell: {
        color: '#4b4b4b',
        alignment: 'right',
        margin: [0, 5],
      },
      benefitTitle: {
        fontSize: 12,
        bold: true,
        font: 'Swiss-721',
        color: '#4b4b4b',
        margin: [0, 5],
        background: '#D9D9D9',
      },
      BenefitsBody: {
        fontSize: 12,
        font: 'Swiss-721',
        color: '#4b4b4b',
      },
      footer: {
        alignment: 'center',
        fontSize: 10,
        color: '#b1b1b1',
        font: 'Trajan-Pro',
      },
    },
  };
};
