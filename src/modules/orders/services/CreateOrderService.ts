import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found');
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (!foundProducts.length) {
      throw new AppError('Could not find any products');
    }

    if (foundProducts.length !== products.length) {
      throw new AppError('Some of the products could not be found');
    }

    const productsWithUpdatedQuantity = foundProducts.map(productInStock => {
      const productToAdd = products.find(
        product => product.id === productInStock.id,
      );

      if (!productToAdd) {
        throw new AppError('Invalid product');
      }

      if (productToAdd.quantity > productInStock.quantity) {
        throw new AppError('Not enough items in stock');
      }

      return {
        id: productInStock.id,
        orderQuantity: productToAdd.quantity,
        quantity: productInStock.quantity - productToAdd.quantity,
        price: productInStock.price,
      };
    });

    await this.productsRepository.updateQuantity(productsWithUpdatedQuantity);

    const productsIds = products.map(product => product.id);
    const productsThatExistOnly = productsWithUpdatedQuantity.filter(product =>
      productsIds.includes(product.id),
    );

    const serializedProducts = productsThatExistOnly.map(product => {
      return {
        product_id: product.id,
        quantity: product.orderQuantity,
        price: product.price,
      };
    });

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    return order;
  }
}

export default CreateOrderService;
