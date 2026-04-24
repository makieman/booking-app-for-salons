import mongoose, { Schema, Document } from 'mongoose';

/**
 * Service interface — represents a treatment/service the salon offers.
 *
 * Fields:
 * - name: Display name of the service (e.g., "Sisterlocks™ Installation")
 * - duration: How long it takes in minutes
 * - price: Cost in KES
 * - description: Optional longer description
 * - image: Optional URL to a service image
 */
export interface IService extends Document {
  name: string;
  duration: number; // in minutes
  price: number;
  description?: string;
  image?: string;
}

const ServiceSchema: Schema = new Schema({
  name: { type: String, required: true },
  duration: { type: Number, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  image: { type: String },
});

export default mongoose.model<IService>('Service', ServiceSchema);
