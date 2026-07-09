import mongoose, { Schema, Document } from 'mongoose';

/**
 * Service interface — represents a treatment/service the salon offers.
 *
 * Fields:
 * - name: Display name of the service (e.g., "Sisterlocks™ Installation")
 * - duration: How long it takes in minutes
 * - price: Base/minimum price in KES
 * - priceMax: Optional maximum price in KES (used for price-range display, e.g. KES 2,000 – 5,000)
 * - description: Optional longer description
 * - image: Optional URL to a service image
 */
export interface IService extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  duration: number; // in minutes
  price: number;
  priceMax?: number; // optional upper bound for price-range display
  description?: string;
  image?: string;
}

const ServiceSchema: Schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true },
  duration: { type: Number, required: true },
  price: { type: Number, required: true },
  priceMax: { type: Number }, // optional — omit for fixed price, set for a range
  description: { type: String },
  image: { type: String },
});

export default mongoose.model<IService>('Service', ServiceSchema);
