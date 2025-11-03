import Product from 'src/products/interfaces/product.interface';

export const formatDate = (date: Date) =>
  date.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export const calculateTotal = (
  products: Product[],
  generalDiscount: number = 0,
  property: string = 'publicPrice',
) => {
  return products.reduce(
    (acc, product) => {
      const productTotal = getProductPrice(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        product[property],
        product?.quantity,
        product?.discount,
        generalDiscount,
      );
      return {
        subtotal: acc?.subtotal + product[property] * product?.quantity,
        total: acc?.total + productTotal,
      };
    },
    { subtotal: 0, total: 0 },
  );
};

export const capitalize = (str: string) => {
  const data = str.split(' ');
  return data
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const getProductPrice = (
  price: number,
  quantity: number,
  discount: number = 0,
  generalDiscount: number = 0,
): number => {
  if (!price || !quantity) return 0;
  const base = price * quantity;
  const baseOffPrice = base * (discount / 100);
  const totalOffPrice = (base - baseOffPrice) * (generalDiscount / 100);
  return base - baseOffPrice - totalOffPrice;
};

export const calculateQuoteTotals = (
  products: Product[],
  generalDiscount: number = 0,
) => {
  const homeProducts = products.filter(
    (product) => product.efficiency === null && product.publicPrice !== null,
  );
  const cabineProducts = products.filter(
    (product) =>
      product.publicPrice === null && product.profesionalPrice !== null,
  );
  console.log('homeProducts: ', homeProducts);
  console.log('cabineProducts: ', cabineProducts);

  const totalHome = homeProducts.reduce(
    (acc, prod) => {
      return {
        totalPublic: acc.totalPublic + (prod.publicPrice || 0) * prod.quantity,
        totalNoDiscount:
          acc.totalNoDiscount + (prod.profesionalPrice || 0) * prod.quantity,
        totalToPay:
          acc.totalToPay +
          getProductPrice(
            prod.profesionalPrice || 0,
            prod.quantity,
            prod.discount || 0,
            generalDiscount || 0,
          ),
      };
    },
    {
      totalPublic: 0,
      totalToPay: 0,
      totalNoDiscount: 0,
    },
  );
  const totalCabine = cabineProducts.reduce(
    (acc, prod) => {
      return {
        averageEfficiency:
          acc.averageEfficiency + (prod.efficiency || 0) * prod.quantity,
        totalNoDiscount:
          acc.totalNoDiscount + prod.profesionalPrice * prod.quantity,
        totalToPay:
          acc.totalToPay +
          getProductPrice(
            prod.profesionalPrice,
            prod.quantity,
            prod.discount || 0,
            generalDiscount || 0,
          ),
      };
    },
    {
      averageEfficiency: 0,
      totalToPay: 0,
      totalNoDiscount: 0,
    },
  );
  const profitability =
    ((totalHome.totalPublic - totalHome.totalToPay) * 100) /
    totalHome.totalPublic;
  return {
    totalHome,
    profitability,
    totalCabine: {
      ...totalCabine,
      averageEfficiency: totalCabine.averageEfficiency / cabineProducts.length,
    },
  };
};

export const LowerCaseCapitalize = (str: string) =>
  `${str.charAt(0)}${str.slice(1).toLowerCase()}`;
