import mongoose, { Schema, Document } from 'mongoose';

/**
 * Append-only ledger of every change to a salon's SMS credit balance.
 * Unlike SmsLog this has NO expiry: it is the financial record that explains
 * why a balance is what it is (and the basis for disputes and invoices).
 *
 *  starter  - free credits given to a salon the first time SMS is used
 *  grant    - credits added by the platform admin (e.g. after an M-Pesa payment)
 *  purchase - credits bought through a payment gateway (reserved for the self-serve phase)
 *  usage    - credits spent sending an SMS
 *  refund   - credits returned because the provider failed to send
 */
export type SmsCreditTxKind = 'starter' | 'grant' | 'purchase' | 'usage' | 'refund';

export interface ISmsCreditTx extends Document {
  tenantId: mongoose.Types.ObjectId;
  kind: SmsCreditTxKind;
  /** Positive = credits added, negative = credits spent. */
  delta: number;
  balanceAfter: number;
  /** Booking reference for usage/refund, or payment reference for grant/purchase. */
  reference?: string;
  note?: string;
  createdAt: Date;
}

const SmsCreditTxSchema: Schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  kind: { type: String, enum: ['starter', 'grant', 'purchase', 'usage', 'refund'], required: true },
  delta: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reference: { type: String },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
});

SmsCreditTxSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model<ISmsCreditTx>('SmsCreditTx', SmsCreditTxSchema);
