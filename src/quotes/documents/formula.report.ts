import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Kit } from 'src/kits/entities/kit.entity';
import Product from 'src/products/interfaces/product.interface';
import { tableReport } from 'src/quotes/documents/table.report';
import { Data } from 'src/quotes/interfaces/formula.interface';
import { formatDate, LowerCaseCapitalize } from 'src/quotes/utils/utils';

export const formulaReport = (
  quoteInfo: Data,
  formulaProducts: Product[],
  kitData: Kit | null,
): TDocumentDefinitions => {
  const today = new Date();
  const formatedDate = formatDate(today);

  const { name, consultant, gift, recommendations } = quoteInfo;

  // Modificación: Agregamos keepTogether: true para evitar que se separen los bloques
  const getBenefits: Content[] = formulaProducts.map((product) => ({
    stack: [
      {
        table: {
          widths: ['auto', '*', 'auto'],
          body: [
            [
              {
                text: product.name,
                border: [false, false, false, false],
                fillColor: '#D9D9D9',
                bold: true,
                margin: [2, 3],
              },
              {
                text: '',
                fillColor: '#D9D9D9',
              },
              {
                text: product.phase,
                alignment: 'Right',
                fillColor: '#D9D9D9',
                bold: true,
                margin: [2, 3],
              },
            ],
          ],
        },
        layout: 'noBorders',
      },
      {
        text: 'Activos:',
        style: 'BenefitsBody',
        bold: true,
      },
      {
        text: product.actives,
        style: 'BenefitsBody',
      },
      {
        text: 'Propiedades:',
        style: 'BenefitsBody',
        bold: true,
      },
      {
        stack: product.properties.map((prop, idx) => ({
          text: `${idx + 1}. ${prop}`,
          style: 'BenefitsBody',
        })),
      },
      {
        text: '',
        marginTop: 12,
      },
    ],
    // Esta propiedad evita que el contenido se separe entre páginas
    keepTogether: true,
    // Esta propiedad garantiza espacio adecuado para el footer
    marginBottom: 20,
  }));

  // Validar que todos los productos del kit estén presentes en la cotización
  const allKitProductsIncluded = kitData
    ? kitData.kitProducts.every((kitProduct) =>
        formulaProducts.some(
          (formulaProduct) => formulaProduct.id === kitProduct.product.id,
        ),
      )
    : false;

  // Solo mostrar la página del kit si existe Y todos sus productos están incluidos
  const kitPageContent: Content[] =
    kitData && allKitProductsIncluded
      ? [
          {
            text: `${kitData.name}`,
            style: 'title',
            alignment: 'center',
            pageBreak: 'before',
            marginBottom: kitData.imageLink ? 20 : 30,
            marginTop: kitData.imageLink ? 100 : 0,
          },
          kitData.imageLink
            ? {
                image: 'kit',
                width: 300,
                absolutePosition: {
                  x: 255,
                  y: 30,
                },
              }
            : '',
          {
            columnGap: 20,
            columns: [
              [
                {
                  marginBottom: 10,
                  marginTop: 10,
                  table: {
                    widths: ['*'],
                    body: [
                      [
                        {
                          text: 'PRODUCTOS',
                          border: [false, false, false, false],
                          fillColor: '#D9D9D9',
                          bold: true,
                          alignment: 'center',
                          margin: [2, 3],
                        },
                      ],
                    ],
                  },
                  layout: 'noBorders',
                },
                {
                  stack: formulaProducts.map((prod) => ({
                    text: `- ${LowerCaseCapitalize(prod.name)}`,
                    style: 'BenefitsBody',
                  })),
                },
                {
                  marginBottom: 10,
                  marginTop: 10,
                  table: {
                    widths: ['*'],
                    body: [
                      [
                        {
                          text: 'TIPS',
                          border: [false, false, false, false],
                          fillColor: '#D9D9D9',
                          alignment: 'center',
                          bold: true,
                          margin: [2, 3],
                        },
                      ],
                    ],
                  },
                  layout: 'noBorders',
                },
                {
                  stack: kitData.tips.map((tip) => ({
                    text: `${tip}`,
                    style: 'BenefitsBody',
                  })),
                },
              ],
              [
                {
                  marginBottom: 10,
                  marginTop: 10,
                  table: {
                    widths: ['*'],
                    body: [
                      [
                        {
                          text: 'PROTOCOLOS',
                          border: [false, false, false, false],
                          fillColor: '#D9D9D9',
                          alignment: 'center',
                          bold: true,
                          margin: [2, 3],
                        },
                      ],
                    ],
                  },
                  layout: 'noBorders',
                },
                // Agrupamos el protocolo del día para evitar división
                kitData.protocol.dia.length > 0
                  ? {
                      stack: [
                        {
                          text: 'DIA',
                          style: 'BenefitsBody',
                          bold: true,
                        },
                        ...kitData.protocol.dia.map((tip) => ({
                          text: `- ${tip}`,
                          style: 'BenefitsBody',
                        })),
                      ],
                    }
                  : '',
                // Agrupamos el protocolo de la noche para evitar división
                kitData.protocol.noche.length > 0
                  ? {
                      stack: [
                        {
                          text: 'NOCHE',
                          style: 'BenefitsBody',
                          bold: true,
                        },
                        ...kitData.protocol.noche.map((tip) => ({
                          text: `- ${tip}`,
                          style: 'BenefitsBody',
                        })),
                      ],
                    }
                  : '',
              ],
            ],
          },
        ]
      : [];

  // Define images object conditionally
  // Solo incluir imagen si el kit tiene todos sus productos
  const documentImages = {};
  if (kitData && kitData.imageLink && allKitProductsIncluded) {
    documentImages['kit'] = kitData.imageLink;
  }

  return {
    // Ajustamos los márgenes para dejar más espacio para el footer
    pageMargins: [40, 150, 40, 60],
    background: function () {
      return {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: '#F2EED4' },
        ],
      };
    },
    header: {
      height: 150,
      width: 150,
      image: 'src/assets/logo_30_y.png',
      margin: [20, 10],
    },
    content: [
      { text: 'Recomendación de tu profesional', style: 'title' },
      {
        text: `Estimado/a ${name} a continuación ${consultant} especialista Skinhealth te hace la siguiente recomendación`,
        style: 'body',
      },
      tableReport(formulaProducts, quoteInfo.generalDiscount),
      {
        text: gift ? `Las cortesías por su compra son: ${gift}` : '',
        style: 'body',
        margin: [0, 20],
      },
      {
        text: recommendations
          ? `Recomendaciones:  
            ${recommendations}`
          : '',
        style: 'body',
        pageBreak: 'after',
      },
      { text: 'BENEFICIOS PARA TU PIEL', style: 'title', marginBottom: 10 },
      // Ahora getBenefits ya contiene elementos con keepTogether
      ...getBenefits,
      // kitPageContent ya incluye la validación de productos completos
      ...kitPageContent,
    ],
    images: documentImages,
    // Nuevo footer con tabla y línea roja
    footer: function () {
      return {
        margin: [40, 0, 40, 0],
        table: {
          widths: ['*'],
          body: [
            // Primera fila: línea roja
            [
              {
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 0,
                    x2: 515, // Ancho disponible considerando márgenes
                    y2: 0,
                    lineWidth: 1,
                    lineColor: '#b1b1b1',
                  },
                ],
                border: [false, false, false, false],
                marginBottom: 15,
              },
            ],
            // Segunda fila: texto del footer
            [
              {
                text: `Esta cotización es valida hasta ${formatedDate}\n y esta sujeta a disponibilidad de inventario`,
                style: 'footer',
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: 'noBorders',
      };
    },
    styles: {
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
