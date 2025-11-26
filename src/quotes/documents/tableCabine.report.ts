import { Content } from 'pdfmake/interfaces';
import Product from 'src/products/interfaces/product.interface';
import { CellConfig } from 'src/quotes/interfaces/quote.interface';
import {
  calculateTotal,
  capitalize,
  currencyFormatter,
  getProductPrice,
} from 'src/quotes/utils/utils';

export const tableCabineReport = (
  data: Product[],
  generalDiscount?: number,
  property = 'profesionalPrice',
) => {
  const formulaProducts = data;

  const total = calculateTotal(
    formulaProducts,
    generalDiscount,
    'profesionalPrice',
  );

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
    const { isLast = false, alignment, margin } = config || {};
    return {
      text: capitalize(value),
      style: isLast ? 'lastCell' : 'cell',
      alignment,
      margin,
    };
  };

  const getTableHeaders = () => {
    const baseHeaders = [
      HeaderCell('Nombre', { alignment: 'left' }),
      HeaderCell('Cant'),
      HeaderCell(property === 'publicPrice' ? 'Precio Público' : 'Rendimiento'),
      HeaderCell('Precio Prof.'),
    ];

    if (hasAnyDiscount) {
      baseHeaders.push(HeaderCell('Dcto'));
    }

    baseHeaders.push(HeaderCell('Total de Línea', { isLast: true }));
    return baseHeaders;
  };

  const getTableWidths = () => {
    const baseWidths = [200, 'auto', '*', 'auto'];
    if (hasAnyDiscount) {
      baseWidths.push('auto');
    }
    baseWidths.push('auto');
    return baseWidths;
  };

  const getProductRow = (product: Product, property: string) => {
    const baseRow = [
      regularCell(product.name, { alignment: 'left' }),
      regularCell(String(product.quantity)),
      regularCell(
        property === 'publicPrice'
          ? currencyFormatter.format(Number(product.publicPrice))
          : product.efficiency
            ? String(product.efficiency)
            : '-',
      ),
      regularCell(currencyFormatter.format(Number(product.profesionalPrice))),
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

    const total = getProductPrice(
      Number(product.profesionalPrice),
      Number(product.quantity),
      Number(product.discount),
      Number(generalDiscount),
    );

    baseRow.push(
      regularCell(currencyFormatter.format(total), {
        isLast: true,
      }),
    );

    return baseRow;
  };

  const getTotalRows = () => {
    const totalColSpan = hasAnyDiscount ? 5 : 4;
    const rows: Content[][] = [];

    const getEmptyCells = (count: number) => {
      return Array(count)
        .fill(null)
        .map(() =>
          regularCell('', {
            alignment: 'center',
            margin: [0, 5],
          }),
        );
    };

    if (hasAnyDiscount) {
      rows.push([
        {
          text: 'SUBTOTAL',
          alignment: 'right',
          colSpan: totalColSpan,
          border: [false, false, false, false],
          style: 'tableHeader',
        } as Content,
        ...getEmptyCells(totalColSpan - 1),
        HeaderCell(currencyFormatter.format(total.subtotal), { isLast: true }),
      ]);
      rows.push([
        {
          text: 'AHORRO',
          alignment: 'right',
          colSpan: totalColSpan,
          border: [false, false, false, false],
          style: 'tableHeader',
        } as Content,
        ...getEmptyCells(totalColSpan - 1),
        HeaderCell(currencyFormatter.format(total.subtotal - total.total), {
          isLast: true,
        }),
      ]);
    }

    rows.push([
      {
        text: 'TOTAL',
        alignment: 'right',
        colSpan: totalColSpan,
        border: [false, false, false, false],
        style: 'tableHeader',
      } as Content,
      ...getEmptyCells(totalColSpan - 1),
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
        ...getTotalRows(),
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

  return table;
};
