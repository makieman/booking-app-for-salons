import mongoose, { Schema, Document } from 'mongoose';
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
