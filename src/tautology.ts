/**
 * @fileoverview States the limits of execution evidence without parsing or
 * classifying mathematical commands. Independence remains a host review duty.
 */
import type { EvidencePurpose, Request } from './schema.js';

export interface VerificationNote {
  requirement: string; purpose: EvidencePurpose | 'unspecified';
  message: string;
}

/** A successful assertion does not certify its independence from construction. */
export function verificationNotes(
  requirements: Request['plan']['requirements'],
): VerificationNote[] {
  return requirements.map(requirement => ({
    requirement: requirement.id, purpose: requirement.purpose ?? 'unspecified',
    message: 'Checks verify declared facts. Review construction correctness, '
      + 'problem constraints and interaction coverage separately; independence '
      + 'from the construction is not automatically certified.',
  }));
}
