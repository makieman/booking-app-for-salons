import mongoose, { Schema, Document } from 'mongoose';
export interface IPushSubscription extends Document {
  tenantId: mongoose.Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: 'customer' | 'admin' | 'attendant';
  customerPhone?: string;
  /** For role='attendant': the attendant's MongoDB ObjectId as a string */
  attendantId?: string;
  employeeId?: string;
  soundPreference?: 'default' | 'chime' | 'bell' | 'ding' | 'silent';
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema: Schema = new Schema(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    endpoint:      { type: String, required: true, unique: true },
    keys: {
      p256dh:      { type: String, required: true },
      auth:        { type: String, required: true },
    },
    role:          { type: String, enum: ['customer', 'admin', 'attendant'], default: 'customer', index: true },
    customerPhone: { type: String, index: true },   // required for role:'customer', omitted for role:'admin'/'attendant'
    attendantId:   { type: String, index: true },   // required for role:'attendant'
    employeeId:    { type: String, index: true },
    soundPreference: { type: String, enum: ['default', 'chime', 'bell', 'ding', 'silent'], default: 'default' },
  },
  { timestamps: true }
);

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
