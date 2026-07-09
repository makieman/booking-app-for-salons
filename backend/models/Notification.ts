import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  tenantId: mongoose.Types.ObjectId;
  recipientId: string; // Attendant ObjectId or tenant ObjectId (for admin)
  recipientType: 'admin' | 'attendant' | 'customer';
  customerPhone?: string; // Optional: phone number for customer-focused logs
  title: string;
  body: string;
  url?: string;
  sound?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    recipientId:   { type: String, required: true, index: true },
    recipientType: { type: String, enum: ['admin', 'attendant', 'customer'], required: true, index: true },
    customerPhone: { type: String, index: true },
    title:         { type: String, required: true },
    body:          { type: String, required: true },
    url:           { type: String },
    sound:         { type: String, default: 'default' },
    read:          { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Expire notifications after 30 days to limit backend DB storage overhead
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
