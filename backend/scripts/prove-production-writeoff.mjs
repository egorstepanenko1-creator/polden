/**
 * Proof: PRODUCTION_CONSUMPTION is a valid negative stock movement type.
 */
import 'dotenv/config';
import { movementSignedQuantity } from '../src/stockMovement.js';

const x = movementSignedQuantity('PRODUCTION_CONSUMPTION', 2.5);
if (x !== -2.5) {
  console.error('Expected -2.5, got', x);
  process.exit(1);
}
console.log('prove-production-writeoff: OK (sign rule)');
