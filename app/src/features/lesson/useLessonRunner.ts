import { useCallback, useMemo, useState } from 'react';
import type { Exercise } from '@/types/api';
import type { ExerciseResult } from './exercises/types';

export interface LessonRunnerState {
  currentExercise: Exercise | undefined;
  currentIndex: number;
  total: number;
  progress: number; // 0-1
  correctCount: number;
  wrongCount: number;
  hearts: number;
  isOutOfHearts: boolean;
  isFinished: boolean;
}

export interface UseLessonRunnerResult extends LessonRunnerState {
  handleComplete: (result: ExerciseResult) => void;
}

/**
 * Drives a single lesson attempt: sequences exercises, tracks correct/wrong
 * answers, and decrements hearts on mistakes. Purely local/ephemeral — the
 * caller is responsible for POSTing the final tally to
 * `/progress/lesson-complete` once `isFinished` (or `isOutOfHearts`) flips.
 */
export function useLessonRunner(exercises: Exercise[], startingHearts: number): UseLessonRunnerResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [hearts, setHearts] = useState(startingHearts);
  const [isFinished, setIsFinished] = useState(false);

  const total = exercises.length;
  const currentExercise = exercises[currentIndex];

  const handleComplete = useCallback(
    (result: ExerciseResult) => {
      if (result.correct) {
        setCorrectCount((n) => n + 1);
      } else {
        setWrongCount((n) => n + 1);
        setHearts((h) => Math.max(0, h - 1));
      }

      setCurrentIndex((i) => {
        const next = i + 1;
        if (next >= total) {
          setIsFinished(true);
        }
        return next;
      });
    },
    [total]
  );

  const progress = total > 0 ? Math.min(currentIndex, total) / total : 0;
  const isOutOfHearts = hearts <= 0 && !isFinished;

  return useMemo(
    () => ({
      currentExercise,
      currentIndex,
      total,
      progress,
      correctCount,
      wrongCount,
      hearts,
      isOutOfHearts,
      isFinished,
      handleComplete,
    }),
    [
      currentExercise,
      currentIndex,
      total,
      progress,
      correctCount,
      wrongCount,
      hearts,
      isOutOfHearts,
      isFinished,
      handleComplete,
    ]
  );
}
