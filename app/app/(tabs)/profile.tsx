import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Card, HeartsBar, ScreenContainer, XpBadge, StreakBadge } from '@/components';
import { useProgress } from '@/hooks/useProgress';
import { useAuthStore } from '@/state/authStore';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { MAX_HEARTS } from '@/constants';

export default function ProfileScreen() {
  const progressQuery = useProgress();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const stats = progressQuery.data?.stats;

  return (
    <ScreenContainer backgroundColor={color.gray50}>
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarEmoji}>🌼</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {progressQuery.isLoading ? (
        <ActivityIndicator color={color.blue700} style={styles.loader} />
      ) : (
        <View style={styles.statsGrid}>
          <Card style={styles.statCard} padded>
            <XpBadge xp={stats?.xp ?? 0} />
            <Text style={styles.statLabel}>Total XP</Text>
          </Card>
          <Card style={styles.statCard} padded>
            <StreakBadge streak={stats?.streak ?? 0} />
            <Text style={styles.statLabel}>Day streak</Text>
          </Card>
          <Card style={styles.statCardWide} padded>
            <HeartsBar hearts={stats?.hearts ?? MAX_HEARTS} maxHearts={MAX_HEARTS} />
            <Text style={styles.statLabel}>Hearts</Text>
          </Card>
        </View>
      )}

      <View style={styles.footer}>
        <Button label="Log out" onPress={() => logout()} variant="ghost" testID="logout-button" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  avatarEmoji: { fontSize: 72 },
  email: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.blue900 },
  loader: { marginTop: spacing.xl },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '47%', alignItems: 'center', gap: spacing.xxs },
  statCardWide: { flexBasis: '100%', alignItems: 'center', gap: spacing.xxs },
  statLabel: { fontSize: fontSize.xs, color: color.gray500 },
  footer: { marginTop: 'auto', paddingBottom: spacing.md },
});
