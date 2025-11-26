import { Content } from 'pdfmake/interfaces';
import Product from 'src/products/interfaces/product.interface';
import { CellConfig } from 'src/quotes/interfaces/quote.interface';
import {
  calculateTotal,
  capitalize,
  currencyFormatter,
  getProductPrice,
} from 'src/quotes/utils/utils';

export const tableReport = (
  data: Product[],
  generalDiscount?: number,
  property = 'publicPrice',
) => {
  const formulaProducts = data;

  const total = calculateTotal(formulaProducts, generalDiscount, 'publicPrice');

  const hasAnyDiscount =
    formulaProducts.some((product) => product.discount) || generalDiscount;

  const HeaderCell = (value: string, config?: CellConfig) => {
    const { isLast = false, alignment } = config || {};
    return {
      text: value,
      style: isLast ? 'tableHeaderRight' : 'tableHeader',
      alignment,
    };
  };

  const regularCell = (value: string, config?: CellConfig) => {
    const { isLast = false, alignment, margin, border } = config || {};
    return {
      text: capitalize(value),
      style: isLast ? 'lastCell' : 'cell',
      alignment,
      margin,
      border,
    };
  };

  const getTableHeaders = () => {
    const baseHeaders = [
      HeaderCell('Nombre', {
        alignment: 'left',
      }),
      HeaderCell('Fase de tratamiento', { alignment: 'left' }),
      HeaderCell('Uso', { alignment: 'left' }),
      HeaderCell('Cant'),
    ];

    if (hasAnyDiscount) {
      baseHeaders.push(HeaderCell('Dcto'));
    }

    baseHeaders.push(HeaderCell('Valor', { isLast: true }));
    return baseHeaders;
  };

  const getTableWidths = () => {
    const baseWidths = [200, 'auto', 'auto', 30];
    if (hasAnyDiscount) {
      baseWidths.push('auto');
    }
    baseWidths.push('*');
    return baseWidths;
  };

  const getProductRow = (product: Product, property: string) => {
    const baseRow = [
      regularCell(product.name, { alignment: 'left' }),
      regularCell(product.phase, { alignment: 'left' }),
      regularCell(product.time, { alignment: 'left' }),
      regularCell(product.quantity.toString()),
    ];

    if (hasAnyDiscount) {
      if (!product.discount && !generalDiscount) {
        baseRow.push(regularCell(`0%`));
      }
      if (product.discount && generalDiscount) {
        baseRow.push(
          regularCell(`${product.discount || 0}+${generalDiscount || 0}%`),
        );
      }
      if (product.discount && !generalDiscount) {
        baseRow.push(regularCell(`${product.discount}%`));
      }
      if (!product.discount && generalDiscount) {
        baseRow.push(regularCell(`${generalDiscount}%`));
      }
    }

    const formattedValue = getProductPrice(
      Number(product[property]),
      Number(product.quantity),
      Number(product.discount),
      Number(generalDiscount),
    );
    baseRow.push(
      regularCell(currencyFormatter.format(formattedValue), {
        isLast: true,
      }),
    );

    return baseRow;
  };

  const getTotalRows = () => {
    const rows: Content[][] = [];
    if (hasAnyDiscount) {
      rows.push([
        {
          text: 'SUBTOTAL',
          alignment: 'right',
          border: [false, false, false, false],
          style: 'tableHeader',
        } as Content,
        HeaderCell(currencyFormatter.format(total.subtotal), { isLast: true }),
      ]);
      rows.push([
        {
          text: 'AHORRO',
          alignment: 'right',
          border: [false, false, false, false],
          style: 'tableHeader',
        } as Content,
        HeaderCell(currencyFormatter.format(total.subtotal - total.total), {
          isLast: true,
        }),
      ]);
    }

    rows.push([
      {
        text: 'TOTAL',
        alignment: 'right',
        border: [false, false, false, false],
        style: 'tableHeader',
      } as Content,
      HeaderCell(currencyFormatter.format(total.total), { isLast: true }),
    ]);

    return rows;
  };

  const table: Content = {
    table: {
      widths: getTableWidths(),
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      body: [
        getTableHeaders(),
        ...formulaProducts.map((prod) => getProductRow(prod, property)),
      ],
    },
    layout: {
      hLineWidth: function (i, node) {
        if (!node || !node.table || !node.table.body) return 0;
        return i === 0 || i === node.table.body.length ? 0 : 0;
      },
      vLineWidth: function (i) {
        // Excluir las líneas del borde izquierdo y derecho de la tabla
        const numCols = getTableWidths().length;
        return i === 0 || i === numCols ? 0 : 1;
      },
      hLineColor: function () {
        return '#b1b1b1';
      },
      vLineColor: function () {
        return '#556B2F'; // Color verde olivo
      },
      paddingLeft: function () {
        return 3;
      },
      paddingRight: function () {
        return 3;
      },
      paddingTop: function () {
        return 3;
      },
      paddingBottom: function () {
        return 3;
      },
    },
  };

  const totals: Content = {
    margin: [0, 20, 0, 0],
    table: {
      headerRows: 1,
      widths: ['*', 'auto'],
      dontBreakRows: true,
      body: [...getTotalRows()],
    },
    layout: 'noBorders',
  };

  return [table, totals];
};
