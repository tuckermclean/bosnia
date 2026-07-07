import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiveKitRoom, useLocalParticipant, useVoiceAssistant } from '@livekit/react-native';
import { ConnectionState } from 'livekit-client';
import { useConnectionState, useRoomContext } from '@livekit/components-react';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import { useTutorSession } from '@/hooks/useTutor';
import type { CefrLevel } from '@/types/api';

export interface VoiceCallProps {
  /** CEFR level hint for the tutor's difficulty adaptation, e.g. "A1". */
  level?: CefrLevel;
  onEnd?: () => void;
}

/**
 * Full-duplex Bosnian voice tutor call screen. Requests a LiveKit room +
 * token from the backend, joins it, and renders a live call UI: connection/
 * agent state (listening / thinking / speaking), a running transcript of the
 * tutor's turns, a tap-to-interrupt (barge-in) control, and end-call.
 *
 * The actual conversational brain runs server-side as a LiveKit Agents
 * worker (see `/voice-agent`); this component is purely the call UI.
 */
export function VoiceCall({ level, onEnd }: VoiceCallProps) {
  const sessionQuery = useTutorSession(level);

  if (sessionQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.gold500} size="large" />
        <Text style={styles.hint}>Connecting to Ljilja…</Text>
      </View>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Couldn't start the tutor session. Please try again.</Text>
        <Button label="Back" onPress={onEnd ?? (() => undefined)} variant="ghost" />
      </View>
    );
  }

  const { url, token, sessionId } = sessionQuery.data;

  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio onDisconnected={onEnd}>
      <CallContent onEnd={onEnd} sessionId={sessionId} />
    </LiveKitRoom>
  );
}

function CallContent({ onEnd, sessionId }: { onEnd?: () => void; sessionId?: string }) {
  const room = useRoomContext();
  const connectionState = useConnectionState(room);
  const { state: agentState, agentTranscriptions } = useVoiceAssistant();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const [interrupting, setInterrupting] = useState(false);

  const isConnected = connectionState === ConnectionState.Connected;

  const statusLabel = useMemo(() => {
    if (!isConnected) return 'Connecting…';
    switch (agentState) {
      case 'listening':
        return 'Listening…';
      case 'thinking':
        return 'Ljilja is thinking…';
      case 'speaking':
        return 'Ljilja is speaking';
      default:
        return 'Connected';
    }
  }, [agentState, isConnected]);

  const handleInterrupt = useCallback(() => {
    setInterrupting(true);
    // Best-effort barge-in signal for the voice-agent worker: the agent's
    // VAD already truncates its turn as soon as it detects the learner's
    // mic audio, but this gives an explicit, instant client-side signal too.
    localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify({ type: 'interrupt' })), {
        reliable: true,
        topic: 'lk.interrupt',
      })
      .catch(() => undefined)
      .finally(() => setTimeout(() => setInterrupting(false), 300));
  }, [localParticipant]);

  const handleEndCall = useCallback(() => {
    // TODO(follow-up): call session-end on disconnect (POST the turns/duration
    // for `sessionId` once the backend exposes that endpoint).
    void sessionId;
    room.disconnect();
    onEnd?.();
  }, [room, onEnd, sessionId]);

  const toggleMic = useCallback(() => {
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <View style={[styles.orb, agentState === 'speaking' && styles.orbSpeaking]}>
          <Text style={styles.orbEmoji}>🌼</Text>
        </View>
        <Text style={styles.status}>{statusLabel}</Text>
      </View>

      <Card style={styles.transcriptCard} padded>
        <Text style={styles.transcriptTitle}>Transkript</Text>
        <ScrollView style={styles.transcriptScroll}>
          {agentTranscriptions.length === 0 ? (
            <Text style={styles.transcriptEmpty}>Say something in Bosnian to start…</Text>
          ) : (
            agentTranscriptions.map((seg) => (
              <Text key={seg.id} style={styles.transcriptLine}>
                {seg.text}
              </Text>
            ))
          )}
        </ScrollView>
      </Card>

      <View style={styles.controls}>
        <Pressable
          testID="toggle-mic"
          onPress={toggleMic}
          style={[styles.controlButton, !isMicrophoneEnabled && styles.controlButtonMuted]}
          accessibilityRole="button"
          accessibilityLabel={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          <Text style={styles.controlIcon}>{isMicrophoneEnabled ? '🎙️' : '🔇'}</Text>
        </Pressable>

        <Pressable
          testID="interrupt-button"
          onPress={handleInterrupt}
          disabled={interrupting || agentState !== 'speaking'}
          style={[styles.controlButton, agentState !== 'speaking' && styles.controlButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Interrupt Ljilja"
        >
          <Text style={styles.controlIcon}>✋</Text>
        </Pressable>

        <Pressable
          testID="end-call-button"
          onPress={handleEndCall}
          style={[styles.controlButton, styles.endCallButton]}
          accessibilityRole="button"
          accessibilityLabel="End call"
        >
          <Text style={styles.controlIcon}>📞</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', padding: spacing.lg, gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, flex: 1 },
  hint: { color: color.white, fontSize: fontSize.md, textAlign: 'center' },
  orb: {
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    backgroundColor: color.gold500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbSpeaking: {
    backgroundColor: color.gold400,
    borderWidth: 4,
    borderColor: color.gold300,
  },
  orbEmoji: { fontSize: 56 },
  status: { color: color.white, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  transcriptCard: { maxHeight: 200, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0 },
  transcriptTitle: { color: color.gold300, fontSize: fontSize.xs, marginBottom: spacing.xs },
  transcriptScroll: { maxHeight: 150 },
  transcriptEmpty: { color: color.gray300, fontSize: fontSize.sm, fontStyle: 'italic' },
  transcriptLine: { color: color.white, fontSize: fontSize.sm, marginBottom: spacing.xxs },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonMuted: { backgroundColor: color.gray600 },
  controlButtonDisabled: { opacity: 0.4 },
  endCallButton: { backgroundColor: color.error },
  controlIcon: { fontSize: 26 },
});
