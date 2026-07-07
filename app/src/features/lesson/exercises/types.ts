import type { Exercise } from '@/types/api';

export interface ExerciseResult {
  correct: boolean;
}

export interface ExerciseComponentProps {
  exercise: Exercise;
  /** Called once the learner has checked their answer and tapped "Continue". */
  onComplete: (result: ExerciseResult) => void;
}
