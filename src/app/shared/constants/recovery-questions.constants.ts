export const RECOVERY_QUESTIONS = [
  { id: 1, key: 'recovery.questions.q1' },
  { id: 2, key: 'recovery.questions.q2' },
  { id: 3, key: 'recovery.questions.q3' },
  { id: 4, key: 'recovery.questions.q4' },
  { id: 5, key: 'recovery.questions.q5' },
  { id: 6, key: 'recovery.questions.q6' },
  { id: 7, key: 'recovery.questions.q7' },
  { id: 8, key: 'recovery.questions.q8' },
  { id: 9, key: 'recovery.questions.q9' },
  { id: 10, key: 'recovery.questions.q10' },
] as const;

export type RecoveryQuestion = (typeof RECOVERY_QUESTIONS)[number];
