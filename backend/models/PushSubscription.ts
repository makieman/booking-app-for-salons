import mongoose, { Schema, Document } from 'mongoose';

/**
 * PushSubscription — stores a browser Web Push subscription for a customer.
 *
 * Each browser/device gets a unique endpoint. We link it to the customer
 * by phone number so we can target them when their booking status changes.
 */
export interface IPushSubscription extends Document {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  customerPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema: Schema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    customerPhone: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
