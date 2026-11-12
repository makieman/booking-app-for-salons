import mongoose, { Schema, Document } from 'mongoose';

/**
 * One row per SMS attempt. Used for two things:
 *  1. Spend protection: counting recent sends per phone and per salon.
 *  2. Audit and cost review: who was texted, when, which type, what it cost.
 *
 * The message body is intentionally NOT stored (it contains the customer's name
 * and appointment details). Rows expire automatically after 90 days.
 */
export type SmsLogStatus = 'sent' | 'failed' | 'skipped';

export interface ISmsLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  to: string;
  type: string;
  status: SmsLogStatus;
  segments: number;
  reference?: string;
  provider?: string;
  providerMessageId?: string;
  cost?: string;
  error?: string;
  createdAt: Date;
}

const SmsLogSchema: Schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  to: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
  segments: { type: Number, default: 1 },
  reference: { type: String },
  provider: { type: String },
  providerMessageId: { type: String },
  cost: { type: String },
  error: { type: String },
  // TTL index: MongoDB removes the row ~90 days after creation.
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
});

SmsLogSchema.index({ tenantId: 1, createdAt: -1 });
SmsLogSchema.index({ tenantId: 1, to: 1, createdAt: -1 });

export default mongoose.model<ISmsLog>('SmsLog', SmsLogSchema);
