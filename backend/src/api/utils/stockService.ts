import Product, { IProduct } from '../models/Product';
import { ClientSession, Types } from 'mongoose';

export interface IStockRemovalAllocation {
  quantity: number;
  costPrice: number;
  receivedDate: Date;
}

export interface IRemoveStockDetailedResult {
  totalCost: number;
  allocations: IStockRemovalAllocation[];
}

const assertPositiveQuantity = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label}. It must be greater than 0.`);
  }
};

const assertValidCost = (value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid costPrice. It must be a non-negative number.');
  }
};

/**
 * @desc Adds a new batch of stock to a product.
 * @param productId ID of the product
 * @param quantity The number of items received
 * @param costPrice The cost price for EACH item in this batch
 * @param session Mongoose transaction session
 * @param supplierInvoiceRef Optional ID of the supplier invoice
 * @param source Optional string describing the source (e.g., "Purchase", "Cancelled Order #123")
 */
export const addStock = async (
  productId: string | Types.ObjectId,
  quantity: number,
  costPrice: number,
  session: ClientSession,
  supplierInvoiceRef?: Types.ObjectId,
  source: string = 'Purchase',
  receivedDateOverride?: Date
): Promise<void> => {

  const normalizedQuantity = Number(quantity);
  const normalizedCostPrice = Number(costPrice);
  assertPositiveQuantity(normalizedQuantity, 'quantity');
  assertValidCost(normalizedCostPrice);

  const product = await Product.findById(productId).session(session);
  if (!product) {
    throw new Error(`Product not found for ID: ${productId}`);
  }

  // Naya batch add karein
  product.batches.push({
    quantity: normalizedQuantity,
    costPrice: normalizedCostPrice,
    receivedDate: receivedDateOverride || new Date(),
    supplierInvoiceRef: supplierInvoiceRef,
    source: source // <--- SAVED HERE
  });

  // Total stock update karein
  product.stock = (product.stock || 0) + normalizedQuantity;
  
  product.markModified('batches');
  await product.save({ session });
};


/**
 * @desc Removes stock from a product using FIFO logic and returns the total cost.
 * @param productId ID of the product
 * @param quantityToRemove How many items to remove
 * @param session Mongoose transaction session
 * @returns Total Cost of the removed items (COGS)
 */
export const removeStock = async (
  productId: string | Types.ObjectId,
  quantityToRemove: number,
  session: ClientSession
): Promise<number> => {

  const result = await removeStockDetailed(productId, quantityToRemove, session);
  return result.totalCost;
};

/**
 * @desc Removes stock using FIFO and returns exact per-batch allocations.
 * @param productId ID of the product
 * @param quantityToRemove How many items to remove
 * @param session Mongoose transaction session
 * @returns Total cost and exact per-batch cost allocations
 */
export const removeStockDetailed = async (
  productId: string | Types.ObjectId,
  quantityToRemove: number,
  session: ClientSession
): Promise<IRemoveStockDetailedResult> => {

  const normalizedQuantityToRemove = Number(quantityToRemove);
  assertPositiveQuantity(normalizedQuantityToRemove, 'quantityToRemove');

  const product = await Product.findById(productId).session(session);
  if (!product) {
    throw new Error(`Product not found for ID: ${productId}`);
  }

  if (product.stock < normalizedQuantityToRemove) {
    throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${normalizedQuantityToRemove}`);
  }

  // Batches ko date k hisaab se sort karein (FIFO)
  // Oldest first
  product.batches.sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());

  let totalCostOfRemovedItems = 0;
  let remainingToRemove = normalizedQuantityToRemove;
  const allocations: IStockRemovalAllocation[] = [];

  const newBatches = [];

  for (const batch of product.batches) {
      if (remainingToRemove <= 0) {
          newBatches.push(batch); // Is batch ki zaroorat nahi
          continue;
      }

      if (batch.quantity > remainingToRemove) {
          // Is batch mein se sirf kuch items nikalein
          const removedQty = remainingToRemove;
          totalCostOfRemovedItems += removedQty * batch.costPrice;
          allocations.push({
            quantity: removedQty,
            costPrice: batch.costPrice,
            receivedDate: new Date(batch.receivedDate),
          });
          batch.quantity -= removedQty;
          remainingToRemove = 0;
          newBatches.push(batch); // Batch update ho kar save ho jayega
      } else {
          // Poora batch nikaal dein
          const removedQty = batch.quantity;
          totalCostOfRemovedItems += removedQty * batch.costPrice;
          allocations.push({
            quantity: removedQty,
            costPrice: batch.costPrice,
            receivedDate: new Date(batch.receivedDate),
          });
          remainingToRemove -= removedQty;
          // Is batch ko newBatches mein add nahi karein (kyunke yeh khatam ho gaya)
      }
  }
  
  if (remainingToRemove > 0) {
      throw new Error(`Stock calculation error for ${product.name}.`);
  }

  // Product ke batches aur stock ko update karein
  product.batches = newBatches;
  product.stock -= normalizedQuantityToRemove;

  product.markModified('batches');
  await product.save({ session });

  return {
    totalCost: totalCostOfRemovedItems,
    allocations,
  };
};