import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Button, Card } from '@/components';
import { useSubmitPronunciation } from '@/hooks/usePronunciation';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import { isPlayableAudioUrl } from '@/utils/audio';
import type { PronunciationResult } from '@/types/api';

export interface RecordExerciseProps {
  targetPhrase: string;
  /** Reference `bs-BA` pronunciation audio, if the content pipeline generated
   * one. May be a `PLACEHOLDER://…` sentinel when no Azure TTS key is
   * configured — the listen button is disabled in that case. */
  audioUrl?: string;
  exerciseId?: string;
  onComplete?: (result: PronunciationResult) => void;
}

type Stage = 'idle' | 'recording' | 'recorded' | 'submitting' | 'result' | 'error';

export function RecordExercise({ targetPhrase, audioUrl, exerciseId, onComplete }: RecordExerciseProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const canPlayReference = isPlayableAudioUrl(audioUrl);
  const referencePlayer = useAudioPlayer(canPlayReference ? audioUrl : null);
  const referenceStatus = useAudioPlayerStatus(referencePlayer);

  const submitMutation = useSubmitPronunciation();

  const playReference = useCallback(() => {
    if (!canPlayReference) return;
    referencePlayer.seekTo(0);
    referencePlayer.play();
  }, [canPlayReference, referencePlayer]);

  const startRecording = useCallback(async () => {
    setPermissionError(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setPermissionError('Microphone permission is required to practice pronunciation.');
      setStage('error');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStage('recording');
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    await recorder.stop();
    setStage('recorded');
  }, [recorder]);

  const submit = useCallback(() => {
    if (!recorder.uri) return;
    setStage('submitting');
    submitMutation.mutate(
      { audioUri: recorder.uri, targetPhrase, exerciseId },
      {
        onSuccess: (result) => {
          setStage('result');
          onComplete?.(result);
        },
        onError: () => {
          setStage('error');
        },
      }
    );
  }, [recorder.uri, submitMutation, targetPhrase, exerciseId, onComplete]);

  const retry = useCallback(() => {
    submitMutation.reset();
    setStage('idle');
  }, [submitMutation]);

  // Auto-submit once a recording is stopped and has a valid uri.
  useEffect(() => {
    if (stage === 'recorded' && recorder.uri) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const result = submitMutation.data;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Say this phrase out loud:</Text>
      <Text style={styles.target}>{targetPhrase}</Text>

      {audioUrl ? (
        <Pressable
          testID="play-reference"
          onPress={playReference}
          disabled={!canPlayReference}
          style={[styles.listenButton, !canPlayReference && styles.listenButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Listen to reference pronunciation"
        >
          <Text style={styles.listenIcon}>{referenceStatus.playing ? '🔊' : '🔈'}</Text>
          <Text style={styles.listenLabel}>
            {canPlayReference ? 'Listen' : 'Audio not available yet'}
          </Text>
        </Pressable>
      ) : null}

      {stage === 'idle' && (
        <Button label="🎙️ Tap to record" onPress={startRecording} testID="start-recording" />
      )}

      {stage === 'recording' && (
        <Button
          label={`Recording… (${recorderState.durationMillis ? Math.round(recorderState.durationMillis / 1000) : 0}s) Tap to stop`}
          onPress={stopRecording}
          variant="danger"
          testID="stop-recording"
        />
      )}

      {(stage === 'submitting') && (
        <View style={styles.center}>
          <ActivityIndicator color={color.blue700} />
          <Text style={styles.hint}>Grading your pronunciation…</Text>
        </View>
      )}

      {stage === 'error' && (
        <Card style={styles.errorCard} padded>
          <Text style={styles.errorText}>
            {permissionError ?? 'Something went wrong grading your pronunciation.'}
          </Text>
        </Card>
      )}

      {stage === 'result' && result && (
        <ResultView result={result} />
      )}

      {(stage === 'result' || stage === 'error') && (
        <Button label="Try again" onPress={retry} variant="ghost" testID="retry-button" />
      )}
    </View>
  );
}

function ResultView({ result }: { result: PronunciationResult }) {
  return (
    <View style={styles.resultContainer}>
      <View style={styles.scoreRow}>
        <Text style={styles.scoreValue}>{Math.round(result.score)}</Text>
        <Text style={styles.scoreMax}>/100</Text>
      </View>

      <View style={styles.perWordRow} testID="per-word-row">
        {result.perWord.map((w, i) => (
          <View
            key={`${w.target}-${i}`}
            style={[styles.wordChip, w.matched ? styles.wordChipMatched : styles.wordChipUnmatched]}
          >
            <Text style={[styles.wordChipText, w.matched ? styles.wordChipTextMatched : styles.wordChipTextUnmatched]}>
              {w.target}
            </Text>
          </View>
        ))}
      </View>

      <Card padded style={styles.transcriptCard}>
        <Text style={styles.transcriptLabel}>We heard:</Text>
        <Text style={styles.transcriptText}>{result.transcript || '—'}</Text>
      </Card>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  label: { fontSize: fontSize.sm, color: color.gray500 },
  target: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.blue900 },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: color.blue50,
  },
  listenButtonDisabled: { backgroundColor: color.gray100 },
  listenIcon: { fontSize: fontSize.md },
  listenLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.blue700 },
  center: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  hint: { color: color.gray500, fontSize: fontSize.sm },
  errorCard: { backgroundColor: color.errorBg, borderWidth: 0 },
  errorText: { color: color.gray800, fontSize: fontSize.sm },
  resultContainer: { gap: spacing.md },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs },
  scoreValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: color.gold600 },
  scoreMax: { fontSize: fontSize.md, color: color.gray400, marginBottom: 4 },
  perWordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  wordChip: {
    borderRadius: radius.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  wordChipMatched: { backgroundColor: color.successBg, borderColor: color.success },
  wordChipUnmatched: { backgroundColor: color.errorBg, borderColor: color.error },
  wordChipText: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  wordChipTextMatched: { color: color.success },
  wordChipTextUnmatched: { color: color.error },
  transcriptCard: { backgroundColor: color.gray50 },
  transcriptLabel: { fontSize: fontSize.xs, color: color.gray500, marginBottom: spacing.xxs },
  transcriptText: { fontSize: fontSize.md, color: color.gray800, fontStyle: 'italic' },
  feedbackText: { fontSize: fontSize.sm, color: color.gray800 },
});
