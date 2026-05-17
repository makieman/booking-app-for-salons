import mongoose, { Schema, Document } from 'mongoose';

/**
 * PushSubscription — stores a browser Web Push subscription.
 *
 * role: 'customer' subscriptions are linked to a phone number and receive
 *       booking status updates (confirmed / cancelled).
 * role: 'admin'    subscriptions receive new-booking alerts and are not
 *       tied to a phone number.
 */
export interface IPushSubscription extends Document {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: 'customer' | 'admin';
  customerPhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema: Schema = new Schema(
  {
    endpoint:      { type: String, required: true, unique: true },
    keys: {
      p256dh:      { type: String, required: true },
      auth:        { type: String, required: true },
    },
    role:          { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    customerPhone: { type: String, index: true },   // required for role:'customer', omitted for role:'admin'
  },
  { timestamps: true }
);

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
